import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import {preparationAvailabilityDefinition} from './build/preparation-availability.js';
import {scripturePassageBindingsDefinition} from './build/scripture-passage-availability.js';
export default defineConfig({define:{__FIA_PREPARATION_AVAILABILITY__:preparationAvailabilityDefinition(),__FIA_SCRIPTURE_PASSAGE_BINDINGS__:scripturePassageBindingsDefinition()},plugins:[svelte()],resolve:{conditions:['browser']},test:{environment:'jsdom',include:['tests/*.spec.js'],clearMocks:true}});
