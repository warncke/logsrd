import uWS from 'uWebSockets.js';

import Persist from './lib/persist';
import Server from './lib/server';

const host = process.env.HOST || '127.0.0.1'
const port = parseInt(process.env.PORT || '7000')
const version = '0.0.1'

run().catch(console.error).then(() => process.exit(0));

async function run(): Promise<void> {
    const persist = new Persist({
        dataDir: '',
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
        res.end('Nothing to see here!');
    })
    
    logsrd.listen(port, (token) => {
        if (token) {
          console.log('Listening to port ' + port);
        } else {
          console.log('Failed to listen to port ' + port);
        }
    })
}
