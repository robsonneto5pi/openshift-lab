#!/usr/bin/env node
/**
 * git-archive-lf.js — Gera um tar do Git HEAD:subdir com line endings LF garantidos.
 *
 * Problema: `git archive` no Windows converte LF→CRLF nos blobs de texto
 * mesmo quando .gitattributes define eol=lf. Isso quebra scripts shell no S2I
 * com o erro "/bin/bash^M: bad interpreter".
 *
 * Solução: extrai o tar via `git archive`, relê cada entrada de texto e
 * substitui CRLF→LF antes de reescrever o arquivo de saída.
 *
 * Uso: node scripts/git-archive-lf.js <treeish> <output.tar>
 * Ex:  node scripts/git-archive-lf.js HEAD:chat-backend backend-build.tar
 */
'use strict';
const { execSync, spawnSync } = require('child_process');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

const [,, treeish, outFile] = process.argv;
if (!treeish || !outFile) {
  console.error('Uso: node scripts/git-archive-lf.js <treeish> <output.tar>');
  process.exit(1);
}

// Diretório temporário para extrair e reempacotar
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-archive-'));

try {
  // 1. Extrair o archive original
  const archiveBuf = spawnSync('git', ['archive', treeish], { maxBuffer: 50 * 1024 * 1024 });
  if (archiveBuf.status !== 0) {
    console.error('Erro no git archive:', archiveBuf.stderr.toString());
    process.exit(1);
  }
  const tmpTar = path.join(tmpDir, 'original.tar');
  fs.writeFileSync(tmpTar, archiveBuf.stdout);

  // 2. Extrair para diretório temporário
  const extractDir = path.join(tmpDir, 'src');
  fs.mkdirSync(extractDir);
  spawnSync('tar', ['-xf', tmpTar, '-C', extractDir], { stdio: 'inherit' });

  // 3. Corrigir CRLF→LF em todos os arquivos de texto
  const TEXT_EXTS = new Set(['.go','.js','.ts','.html','.css','.json',
                              '.yaml','.yml','.md','.env','.sh','.bash',
                              '.gitignore','','.mod','.sum']);
  const BINARY_EXTS = new Set(['.png','.jpg','.jpeg','.gif','.ico',
                                '.pdf','.exe','.gz','.zip','.tar','.woff','.woff2']);

  function fixLF(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        fixLF(full);
      } else {
        const ext = path.extname(entry.name).toLowerCase();
        if (!BINARY_EXTS.has(ext)) {
          const content = fs.readFileSync(full);
          if (content.includes(0x0d)) { // CR byte present
            fs.writeFileSync(full, content.toString('binary').replace(/\r\n/g, '\n'), 'binary');
          }
        }
      }
    }
  }
  fixLF(extractDir);

  // 4. Reempacotar em novo tar
  const absOut = path.resolve(outFile);
  const result = spawnSync('tar', ['-cf', absOut, '-C', extractDir, '.'], { stdio: 'inherit' });
  if (result.status !== 0) {
    console.error('Erro ao reempacotar o tar');
    process.exit(1);
  }

  console.log(`✅  ${treeish}  →  ${outFile}  (${Math.round(fs.statSync(absOut).size/1024)}KB, LF garantido)`);
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
