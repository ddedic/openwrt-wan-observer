import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const extraction = `import gzip,importlib.util,io,pathlib,sys,tarfile
root=pathlib.Path(sys.argv[1])
spec=importlib.util.spec_from_file_location('builder',root/'tools/build-ipk.py')
builder=importlib.util.module_from_spec(spec);spec.loader.exec_module(builder)
with tarfile.open(root/'dist'/f'wan-observer-glinet_{builder.VERSION}_all.ipk') as package:
 data=package.extractfile('./data.tar.gz').read()
with tarfile.open(fileobj=io.BytesIO(data),mode='r:gz') as archive:
 source=gzip.decompress(archive.extractfile('./www/views/gl-sdk4-ui-wan-observer.common.js.gz').read())
sys.stdout.buffer.write(source)`;
const releaseSource = execFileSync('python3', ['-c', extraction, projectRoot], {
  maxBuffer: 4 * 1024 * 1024,
}).toString();
const bundle = `window.module = { exports: {} };\n${releaseSource}\nVue.config.productionTip=false; Vue.config.devtools=false; new Vue({render:h=>h(module.exports)}).$mount('#app');`;
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Synthetic WAN Observer test host</title><div id="app"></div><script>window.$getCookie=()=> 'a'.repeat(32);</script><script src="/vue.js"></script><script src="/bundle.js"></script></html>`;
const server = createServer((request, response) => {
  const resources = {
    '/': ['text/html', html],
    '/vue.js': [
      'text/javascript',
      readFileSync(require.resolve('vue/dist/vue.runtime.min.js')),
    ],
    '/bundle.js': ['text/javascript', bundle],
  };
  const resource = resources[request.url];
  if (!resource) {
    response.writeHead(404);
    response.end();
    return;
  }
  response.writeHead(200, {
    'Content-Type': resource[0],
    'Cache-Control': 'no-store',
  });
  response.end(resource[1]);
});
server.listen(4179, '127.0.0.1');
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
