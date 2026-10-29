// Coverage report: node server/fia/preparation/source-associations/coverage.mjs [language book]... (default: eng MRK, spa LUK).
import {buildSourceIndex,coverageReport} from './index.mjs';
import {readRetainedArchives} from './retained.mjs';
const args=process.argv.slice(2),pairs=[];for(let i=0;i+1<args.length;i+=2)pairs.push({language:args[i],book:args[i+1]});
const index=buildSourceIndex(readRetainedArchives());
const reports=(pairs.length?pairs:[{language:'eng',book:'MRK'},{language:'spa',book:'LUK'}]).map(p=>coverageReport(index,p));
process.stdout.write(JSON.stringify(reports,null,1)+'\n');
