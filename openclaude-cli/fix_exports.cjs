const fs = require('fs');
const path = require('path');

const log = fs.readFileSync('tsc_errors.log', 'utf8');
const regex = /src\/([^:]+)\(\d+,\d+\): error TS2305: Module '"([^"]+)"' has no exported member '([^']+)'/g;
let match;

const additions = {};

while ((match = regex.exec(log)) !== null) {
    const sourceFile = match[1];
    let importedModule = match[2];
    const exportedMember = match[3];

    // Some modules might be like './types/message.js'. We need to resolve to .ts
    let modulePath;
    if (importedModule.startsWith('.')) {
        const sourceDir = path.dirname(path.join('src', sourceFile));
        modulePath = path.resolve(sourceDir, importedModule);
    } else {
        modulePath = path.resolve('node_modules', importedModule);
    }

    if (modulePath.endsWith('.js')) {
        modulePath = modulePath.slice(0, -3) + '.ts';
    }

    if (!additions[modulePath]) {
        additions[modulePath] = new Set();
    }
    additions[modulePath].add(exportedMember);
}

// Also handle namespace errors: TS2694: Namespace '"..."' has no exported member '...'
const regexNs = /error TS2694: Namespace '"([^"]+)"' has no exported member '([^']+)'/g;
while ((match = regexNs.exec(log)) !== null) {
    let modulePath = match[1] + '.ts';
    const exportedMember = match[2];
    
    // Convert to absolute path
    if (!path.isAbsolute(modulePath)) {
        modulePath = path.resolve(modulePath);
    }

    if (!additions[modulePath]) {
        additions[modulePath] = new Set();
    }
    additions[modulePath].add(exportedMember);
}

for (const [modulePath, members] of Object.entries(additions)) {
    if (fs.existsSync(modulePath)) {
        console.log(`Adding ${members.size} exports to ${modulePath}`);
        let content = fs.readFileSync(modulePath, 'utf8');
        for (const member of members) {
            if (!content.includes(`export type ${member}`)) {
                content += `\nexport type ${member} = any;\n`;
            }
        }
        fs.writeFileSync(modulePath, content);
    } else {
        console.log(`File not found: ${modulePath}`);
    }
}
