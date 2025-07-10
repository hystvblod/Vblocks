const fs = require('fs');
const path = require('path');

const config = {
  classic: ['controls.js', 'game_classic.js', 'intro.js', 'score.js'],
  challenge: ['controls.js', 'game_challenge.js', 'intro.js', 'score.js'],
  infini: ['controls.js', 'game_infini.js', 'intro.js', 'score.js']
};

const common = ['scripts/pause.js', 'scripts/settings.js'];

const outputNames = { classic: 'classic.js', infini: 'infini.js' };

for (const [dir, files] of Object.entries(config)) {
  const outFile = outputNames[dir] || 'bundle.js';
  const outPath = path.join(__dirname, '..', dir, outFile);
  let bundle = '';
  const inputs = files.map(f => path.join(dir, f)).concat(common);

  for (const input of inputs) {
    const fullPath = path.join(__dirname, '..', input);
    bundle += `// Begin ${input}\n` + fs.readFileSync(fullPath, 'utf8') + '\n\n';
  }
  fs.writeFileSync(outPath, bundle, 'utf8');
  console.log(`Built ${outPath}`);
}
