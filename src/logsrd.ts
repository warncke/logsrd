import uWS from 'uWebSockets.js';

import Persist from './lib/persist';
import Server from './lib/server';

run().catch(console.error).then(() => process.exit(0));

async function run(): Promise<void> {
    const persist: Persist = new Persist({
        dataDir: '',
    });

    await persist.init();
    
    const server: Server = new Server({
        persist,
    });
    
    const logsrd = uWS.App({
        
    });
}
