import { mkdirSync } from 'fs';
import { join } from 'path';

const basePath = process.argv[2];

try {
    // First level directories (00-FF)
    for (let i = 0; i < 256; i++) {
        const parentHex = i.toString(16).padStart(2, '0').toLowerCase();
        const parentPath = join(basePath, parentHex);
        mkdirSync(parentPath);
        
        // Second level directories (00-FF)
        for (let j = 0; j < 256; j++) {
            const childHex = j.toString(16).padStart(2, '0').toLowerCase();
            const childPath = join(parentPath, childHex);
            mkdirSync(childPath);
        }
    }
    console.log('Directory structure created successfully');
} catch (error) {
    console.error('Error creating directory structure:', error);
}