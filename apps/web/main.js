import {mount} from 'svelte';
import App from './App.svelte';
import './style.css';
mount(App,{target:document.getElementById('app')});
import {retirePreviousWorker} from './retire-worker.js';
void retirePreviousWorker();
