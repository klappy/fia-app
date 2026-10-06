import {defineConfig} from 'vite';
import {svelte} from '@sveltejs/vite-plugin-svelte';
import {versionStamp} from './scripts/version-stamp.js';
import {preparationAvailabilityDefinition} from './apps/web/build/preparation-availability.js';
export default defineConfig({define:{__FIA_PREPARATION_AVAILABILITY__:preparationAvailabilityDefinition()},root:'apps/web',base:'/',plugins:[svelte(),versionStamp()],build:{outDir:'../../dist',emptyOutDir:true}});
