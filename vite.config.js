import {defineConfig} from 'vite';
import {svelte} from '@sveltejs/vite-plugin-svelte';
import {versionStamp} from './scripts/version-stamp.js';
import {preparationAvailabilityDefinition} from './apps/web/build/preparation-availability.js';
import {scripturePassageBindingsDefinition} from './apps/web/build/scripture-passage-availability.js';
export default defineConfig({define:{__FIA_PREPARATION_AVAILABILITY__:preparationAvailabilityDefinition(),__FIA_SCRIPTURE_PASSAGE_BINDINGS__:scripturePassageBindingsDefinition()},root:'apps/web',base:'/',plugins:[svelte(),versionStamp()],build:{outDir:'../../dist',emptyOutDir:true}});
