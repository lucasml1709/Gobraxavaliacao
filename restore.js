const { execSync } = require('child_process');
const path = require('path');
const repoDir = 'C:\\Users\\01008017\\Desktop\\NOVO\\Nova pasta\\Gobraxavaliacao';

// Strategy 1: Try to read git objects directly from .git directory
const fs = require('fs');

// First, let's read the HEAD commit hash
const headRef = fs.readFileSync(path.join(repoDir, '.git', 'HEAD'), 'utf8').trim();
let commitHash;
if (headRef.startsWith('ref: ')) {
  const refFile = headRef.replace('ref: ', '');
  commitHash = fs.readFileSync(path.join(repoDir, '.git', refFile), 'utf8').trim();
} else {
  commitHash = headRef;
}
console.log('HEAD commit:', commitHash);

// Read the commit object
function readObject(hex) {
  const zlib = require('zlib');
  const filePath = path.join(repoDir, '.git', 'objects', hex.slice(0, 2), hex.slice(2));
  const compressed = fs.readFileSync(filePath);
  const data = zlib.inflateSync(compressed);
  // Parse: "type size\0content"
  const nullIdx = data.indexOf(0x00);
  const header = data.slice(0, nullIdx).toString();
  const content = data.slice(nullIdx + 1);
  return { type: header.split(' ')[0], content };
}

// Parse commit
const commitObj = readObject(commitHash);
console.log('Commit type:', commitObj.type);
const commitLines = commitObj.content.toString().split('\n');
const treeLine = commitLines.find(l => l.startsWith('tree '));
const treeHash = treeLine.split(' ')[1];
console.log('Tree hash:', treeHash);

// Parse tree to find index.html
function parseTree(hash) {
  const treeData = readObject(hash);
  const entries = [];
  let i = 0;
  const buf = treeData.content;
  while (i < buf.length) {
    const spaceIdx = buf.indexOf(0x20, i);
    const mode = buf.slice(i, spaceIdx).toString();
    const nullIdx = buf.indexOf(0x00, spaceIdx);
    const name = buf.slice(spaceIdx + 1, nullIdx).toString();
    const entryHash = buf.slice(nullIdx + 1, nullIdx + 21).toString('hex');
    const type = mode.startsWith('4') ? 'tree' : 'blob';
    entries.push({ mode, type, name, hash: entryHash });
    i = nullIdx + 21;
  }
  return entries;
}

const rootTree = parseTree(treeHash);
const indexEntry = rootTree.find(e => e.name === 'index.html');
if (!indexEntry) {
  console.log('index.html not found in root tree');
  process.exit(1);
}
console.log('Found index.html blob:', indexEntry.hash);

// Read and write the blob content
const blob = readObject(indexEntry.hash);
fs.writeFileSync(path.join(repoDir, 'index.html'), blob.content);
console.log('index.html restored, size:', blob.content.length, 'bytes');