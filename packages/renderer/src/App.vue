<script setup lang="ts">
import { ref, watch, provide, reactive, onMounted } from 'vue'
import { ipcRenderer } from 'electron';
import { TextureResizeFilter } from '@gltf-transform/functions';
import Store from 'electron-store';
import path from 'path';
import BabylonScene from './components/BabylonScene.vue';
import TitleBar from './components/TitleBar.vue';
import DropFileInput from './components/DropFileInput.vue';
import GeneralOptions from './components/Tabs/GeneralOptions.vue';
import TextureOptions from './components/Tabs/TextureOptions.vue';
import VertexCompressionOptions from './components/Tabs/VertexCompressionOptions.vue';
import FileInfo from './components/FileInfo.vue';
import Log from './components/Log.vue';
import Tabs from './components/Tabs/Tabs.vue';
import ErrorMessage from './components/ErrorMessage.vue';
import PackButton from './components/PackButton.vue';

import type ElectronStore from 'electron-store';
import type { IpcRendererEvent } from 'electron/common';
import type { IPackOptions, CameraPosition } from 'types';

const store = new Store() as ElectronStore<IPackOptions>;
const activeTab = ref<string>('general');
const inputFile = ref<File | null>(null);
const outputFile = ref<File | null>(null);
const packOptions = reactive<IPackOptions>({
  doDedupe: store.get('doDedupe', true),
  doReorder: store.get('doReorder', true),
  doWeld: store.get('doWeld', true),
  doInstancing: store.get('doInstancing', false),
  doResize: store.get('doResize', false),
  doBasis: store.get('doBasis', false),
  doDraco: store.get('doDraco', false),
  resamplingFilter: store.get('resamplingFilter', TextureResizeFilter.LANCZOS3),
  textureResolutionWidth: store.get('textureResolutionWidth', 1024),
  textureResolutionHeight: store.get('textureResolutionHeight', 1024),
  vertexCompressionMethod: store.get('vertexCompressionMethod', 'edgebreaker'),
  quantizationVolume: store.get('quantizationVolume', 'mesh'),
  quantizationColor: store.get('quantizationColor', 8),
  quantizationGeneric: store.get('quantizationGeneric', 12),
  quantizationNormal: store.get('quantizationNormal', 10),
  quantizationPosition: store.get('quantizationPosition', 14),
  quantizationTexCoord: store.get('quantizationTexCoord', 12),
  basisMethod: store.get('basisMethod', 'UASTC'),
  pngFormatFilter: store.get('pngFormatFilter', 'ALL'),
  etc1sQuality: store.get('etc1sQuality', 128),
  etc1sResizeNPOT: store.get('etc1sResizeNPOT', true),
  uastcLevel: store.get('uastcLevel', 2),
  uastcResizeNPOT: store.get('uastcResizeNPOT', true),
  encodeSpeed: store.get('encodeSpeed', 5),
  decodeSpeed: store.get('decodeSpeed', 5),
});

const outputPath = ref<string>('');
const errorMessage = ref<string>('');
const isProcessing = ref<boolean>(false);
const inputFileSize = ref<number>(0);
const outputFileSize = ref<number>(0);
const cameraPosition = ref<CameraPosition | null>(null);
const logs = reactive<string[]>([]);
const errorMessageTimeout = ref<ReturnType<typeof setTimeout> | null>(null);

const tabMap = {
  'general': GeneralOptions,
  'texture': TextureOptions,
  'vertex': VertexCompressionOptions,
};

const addLog = (data: any) => {
  const date = new Date();
  const dateString = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const timeString = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: 'numeric', second: 'numeric', fractionalSecondDigits: 3 });

  logs.unshift(`(${dateString} ${timeString}) ${data}`);
};

const drop = (event: DragEvent) => {
  event.preventDefault();
  event.stopPropagation();

  const droppedFiles = event.dataTransfer?.files;

  if (droppedFiles) {
    for (let i = 0; i < droppedFiles.length; i++) {
      const file = droppedFiles.item(i);

      if (file) {
        inputFile.value = file;
        outputPath.value = path.dirname(file.path);
        inputFileSize.value = file.size;
        outputFile.value = null;

        break;
      }
    }
  }

  addLog('Added file: ' + inputFile.value?.path);
};

const dragover = (event: DragEvent) => {
  event.preventDefault();
};

const doPack = () => {
  ipcRenderer.send('request-pack', {
    file: inputFile.value?.path,
    outputPath: outputPath.value,
    ...packOptions,
  });

  outputFileSize.value = 0;
  isProcessing.value = true;

  addLog('Requesting pack for ' + inputFile.value?.path);
};

const updateCameraPosition = (event: CameraPosition) => {
  cameraPosition.value = event;
};

const onPackSuccess = (event: IpcRendererEvent, data: any) => {
  isProcessing.value = false;
  outputFile.value = data.file;
  outputFileSize.value = data.file.binary.byteLength;

  addLog('Packing successful. Reduced file size by ' + (100 - (outputFileSize.value / inputFileSize.value) * 100).toFixed(2) + '%.');
};

const onPackError = (event: IpcRendererEvent, data: any) => {
  errorMessage.value = data.error.message;
  isProcessing.value = false;

  addLog('Error: ' + data.error.message);
};

const onPackSizeReport = (event: IpcRendererEvent, data: any) => {
  addLog(`Action ${data.action} reduced file size by ${(100 - (data.endSize / data.startSize) * 100).toFixed(2)}%.`);
};

const onLoggingEvent = (event: IpcRendererEvent, data: any) => {
  addLog(`[${data.verbosity}] ${data.text}`);
};

const errorWatcher = () => {
  if (errorMessageTimeout.value) {
    clearTimeout(errorMessageTimeout.value);
  }

  if (errorMessage.value) {
    errorMessageTimeout.value = setTimeout(() => {
      errorMessage.value = '';
    }, 5000);
  }
};

const packOptionsWatcher = (newValue: IPackOptions) => {
  store.set(newValue);
};

const mountHandler = () => {
  store.set(packOptions);
};

onMounted(mountHandler);
watch(errorMessage, errorWatcher);
watch(packOptions, packOptionsWatcher);

provide('activeTab', activeTab);
provide('errorMessage', errorMessage);
provide('packOptions', packOptions);
provide('logs', logs);
provide('cameraPosition', cameraPosition);
provide('store', store);

ipcRenderer.on('logging', onLoggingEvent);
ipcRenderer.on('pack-success', onPackSuccess);
ipcRenderer.on('pack-error', onPackError);
ipcRenderer.on('pack-sizereport', onPackSizeReport);
</script>

<template>
  <div @drop="drop" @dragover="dragover" class="flex flex-col flex-wrap flex-1 overflow-hidden select-none">
    <TitleBar />
    <div class="flex flex-row flex-wrap flex-1 overflow-hidden select-none">
      <aside v-if="inputFile" class="basis-[250px] bg-[#ecf0f1] break-words text-left flex flex-col p-0 max-h-full">
        <Tabs />
        <div class="flex flex-col mb-auto">
          <component :is="tabMap[activeTab]" />
        </div>
        <PackButton :isProcessing="isProcessing" @click="doPack" />
      </aside>
      <main v-if="inputFile" class="flex flex-row flex-1 max-h-full overflow-hidden">
        <div class="flex flex-col flex-1">
          <div class="flex flex-row flex-1 overflow-hidden">
            <div class="flex flex-1 flex-col relative overflow-hidden max-w-full max-h-full first-of-type:border-r first-of-type:border-r-[#bdc3c7]">
              <BabylonScene :model="inputFile" @camera-move="updateCameraPosition" />
              <FileInfo :name="inputFile.name" :size="inputFileSize" />
            </div>
            <div v-if="outputFile" class="flex flex-1 flex-col relative overflow-hidden max-w-full max-h-full first-of-type:border-r first-of-type:border-r-[#bdc3c7]">
              <template v-if="isProcessing === false">
                <BabylonScene v-if="outputFile" :model="outputFile" @camera-move="updateCameraPosition" />
                <FileInfo :name="outputFile.name" :size="outputFileSize" />
              </template>
              <template v-if="isProcessing === true">
                <p class="flex items-center justify-center flex-1 m-auto">Processing...</p>
              </template>
            </div>
          </div>
          <Log />
        </div>
      </main>
      <DropFileInput v-if="!inputFile" />
      <ErrorMessage />
    </div>
  </div>
</template>
