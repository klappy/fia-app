import {defineConfig} from 'vite';
import {svelte} from '@sveltejs/vite-plugin-svelte';
import {versionStamp} from './scripts/version-stamp.js';
export default defineConfig({root:'apps/web',base:'/',plugins:[svelte(),versionStamp()],build:{outDir:'../../dist',emptyOutDir:true}});
