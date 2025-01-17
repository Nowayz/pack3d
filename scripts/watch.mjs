import { spawn } from 'child_process';
import { createServer, build } from 'vite';
import electron from 'electron';

const query = new URLSearchParams(import.meta.url.split('?')[1]);
const debug = query.has('debug');

const watchWorker = (server) => {
  return build({
    configFile: 'packages/pack-worker/vite.config.ts',
    mode: 'development',
    plugins: [{
      name: 'electron-worker-watcher',
      writeBundle() {
        server.ws.send({ type: 'full-reload' });
      },
    }],
    build: {
      watch: true,
    },
  });
};

const watchMain = (server) => {
  let electronProcess = null;
  const address = server.httpServer.address();
  const env = {
    ...process.env,
    VITE_DEV_SERVER_HOST: address.address,
    VITE_DEV_SERVER_PORT: address.port,
  };

  const startElectron = {
    name: 'electron-main-watcher',
    writeBundle() {
      if (electronProcess) {
        electronProcess.kill();
      }

      electronProcess = spawn(electron, ['.'], { stdio: 'inherit', env });
    },
  };

  return build({
    configFile: 'packages/main/vite.config.ts',
    mode: 'development',
    plugins: [!debug && startElectron].filter(Boolean),
    build: {
      watch: true,
    },
  });
};

const mainServer = await createServer({ configFile: 'packages/renderer/vite.config.ts' });

await mainServer.listen(3344);

await watchMain(mainServer)
await watchWorker(mainServer);
