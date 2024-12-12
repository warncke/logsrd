import uWS, { HttpResponse } from 'uWebSockets.js';

import Persist from './lib/persist';
import Server from './lib/server';

const dataDir = process.env.DATA_DIR || './data'
const host = process.env.HOST || '127.0.0.1'
const port = parseInt(process.env.PORT || '7000')
const version = '0.0.1'

run().catch(console.error)

async function run(): Promise<void> {
    const persist = new Persist({
        dataDir,
        pageSize: 4096,
        diskCompactThreshold: 1024**2,
        memCompactThreshold: (1024**2) * 100,
    });

    await persist.init();
    
    const server = new Server({
        config: {
            host: `${host}:${port}`,
        },
        persist
    });
    
    const logsrd = uWS.App({
        
    })

    /* Create Log */
    logsrd.post('/log', async (res, req) => {
        let contentType = req.getHeader('content-type');
        if (!contentType.startsWith('application/json')) {
            res.cork(() => {
                res.writeStatus('400')
                res.end('Content-Type: application/json required');
            })
            return
        }

        /* Read the body until done or error */
        readJson(res, async (data: any) => {
            try {
                const config = await server.createLog({ config: data })
                if (config === null) {
                    res.cork(() => {
                        res.writeStatus('400')
                        res.end(JSON.stringify({ error: 'failed to create log'}, null, 2));
                    })
                }
                else {
                    res.cork(() => {
                        res.end(JSON.stringify(config));
                    })
                }
            } catch (err: any) {
                res.cork(() => {
                    res.writeStatus('400')
                    res.end(JSON.stringify({ error: err.message, stack: err.stack}, null, 2));
                })
            }
        }, () => {
            res.cork(() => {
                res.writeStatus('400')
                res.end(JSON.stringify({ error: 'aborted: invalid JSON or no data'}, null, 2));
            })
        });
    })

    /* Get Log Config */
    logsrd.get('/log/:logid/config', async (res, req) => {
        
    })

    /* Get entry(s) from log */
    logsrd.get('/log/:logid', async (res, req) => {
        
    })

    /* Get current version from server */
    logsrd.get('/version', async (res, req) => {
        res.end(version)
    })

    /* Unhandled Routes */
    logsrd.get('/*', (res, req) => {
        res.writeStatus('404')
        res.end('not found');
    })
    
    logsrd.listen(port, (token) => {
        if (token) {
          console.log('Listening to port ' + port);
        } else {
          console.log('Failed to listen to port ' + port);
        }
    })
}

function readJson(res: HttpResponse, cb: (data: any) => void, err: () => any) {
    let buffer: Buffer;
    /* Register data cb */
    res.onData((ab, isLast) => {
      let chunk = Buffer.from(ab);
      if (isLast) {
        let json;
        if (buffer) {
          try {
            json = JSON.parse(new TextDecoder().decode(Buffer.concat([buffer, chunk])));
          } catch (e) {
            /* res.close calls onAborted */
            res.close();
            return;
          }
          cb(json);
        } else {
          try {
            json = JSON.parse(new TextDecoder().decode(chunk));
          } catch (e) {
            /* res.close calls onAborted */
            res.close();
            return;
          }
          cb(json);
        }
      } else {
        if (buffer) {
          buffer = Buffer.concat([buffer, chunk]);
        } else {
          buffer = Buffer.concat([chunk]);
        }
      }
    });
  
    /* Register error cb */
    res.onAborted(err);
  }