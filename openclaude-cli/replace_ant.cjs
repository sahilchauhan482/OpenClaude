const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(dirPath);
  });
}

let count = 0;
walkDir('d:/OpenClaude/openclaude-cli/src', (filePath) => {
  if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
    let content = fs.readFileSync(filePath, 'utf8');
    let newContent = content.replace(/"external" === 'ant'/g, '("external" as string) === "ant"')
                            .replace(/"external" !== 'ant'/g, '("external" as string) !== "ant"');
    if (content !== newContent) {
      fs.writeFileSync(filePath, newContent);
      console.log('Updated: ' + filePath);
      count++;
    }
  }
});
console.log('Total files updated: ' + count);
