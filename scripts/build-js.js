const fs = require('fs/promises');
const path = require('path');
const terser = require('terser');

const rootDir = path.join(__dirname, '..');
const sourceDir = path.join(rootDir, 'src', 'js');
const outputDir = path.join(rootDir, 'public', 'assets', 'js');
const files = ['api.js', 'auth.js', 'ui.js', 'app.js'];

async function build() {
  await fs.mkdir(outputDir, { recursive: true });

  await Promise.all(files.map(async (fileName) => {
    const sourcePath = path.join(sourceDir, fileName);
    const outputName = fileName.replace(/\.js$/, '.min.js');
    const outputPath = path.join(outputDir, outputName);
    const source = await fs.readFile(sourcePath, 'utf8');
    const result = await terser.minify(source, {
      compress: true,
      mangle: true,
      sourceMap: false,
      format: {
        comments: false
      }
    });

    if (result.error) {
      throw result.error;
    }

    await fs.writeFile(outputPath, `${result.code}\n`, 'utf8');
  }));
}

build().catch((error) => {
  console.error(error);
  process.exit(1);
});
