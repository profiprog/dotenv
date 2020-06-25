#!/usr/bin/env node
const { readFileSync, writeFileSync } = require('fs');
//@ts-check


/** @typedef {Object.<string,string>} StringMap */
/** @typedef {{values: StringMap, comments: StringMap, file: string}} EnvData */
/**
 * @param {string} file 
 * @returns {EnvData}
 */
function loadEnv(file = '.env') {
  /** @type {StringMap}  */
  let values = {};
  /** @type {StringMap} */ 
  let comments = {};
  /** @type {number} */ 
  let m;
  /** @type {string[]} */ 
  let comment = []; 
  readFileSync(file, 'utf8').split(/\r?\n/g).forEach(/** @type {string} */ line => {
    if (line.startsWith('#') || line.trim().length === 0) comment.push(line);
    else if ((m = line.indexOf('=')) >= 0) {
      let name = line.substring(0, m);
      values[name] = line.substring(m + 1);
      if (comment.length) { comments[name] = comment.join('\n'); comment = []; }
    }
  });
  return { values, comments, file };
}

Set.prototype.difference = Set.prototype.difference || function (other) {
  let result = new Set(this);
  for (let elem of other) result.delete(elem);
  return result;
};
Set.prototype.intersection = Set.prototype.intersection || function (other) {
  let result = new Set();
  for (let elem of this) if (other.has(elem)) result.add(elem);
  return result;
};
/** @typedef {{mergeMode: 'error'|'warning'|'ignore'|'include'}} MergeContext */
/**
 * @this {MergeContext}
 * @param {EnvData} a
 * @param {EnvData} b
 * @returns {EnvData}
 */
function mergeEnv(a, b) {
  /** @type {EnvData} */
  let result = { values: {}, comments: {} };
  let aKeys = new Set(Object.keys(a.values));
  let bKeys = new Set(Object.keys(b.values));

  let inAdditionKeys = bKeys.difference(aKeys);
  for (let key of aKeys) {
    result.values[key] = b.values[key] || a.values[key];
    result.comments[key] = b.comments[key] || a.comments[key];
  }
  if (inAdditionKeys.size) {
    switch (this.mergeMode) {
      case 'error': throw new Error(removeColors(`Extra keys in '${b.file}': \x1b[33m${[...inAdditionKeys].join('\x1b[0m, \x1b[33m')}\x1b[0m`, !process.stderr.isTTY));
      case 'warning': console.warn(removeColors(`\x1b[38;5;173mWarning:\x1b[0m Extra keys in '${b.file}': \x1b[33m${[...inAdditionKeys].join('\x1b[0m, \x1b[33m')}\x1b[0m`, !process.stderr.isTTY)); break;
      case 'include':
        for (let key of inAdditionKeys) {
          result.values[key] = b.values[key];
          result.comments[key] = b.comments[key];
        }
      case 'ignore': break;
    }
  }
  return result;
}

/** @typedef {{tags: string[]}} FilterContext */
/**
 * @this {FilterContext}
 * @param {EnvData} env
 * @returns {EnvData}
 */
function filterEnv(env) {
  if (!this.tags.length) return env;
  let include = new Set();
  let exclude = new Set();
  this.tags.forEach(tag => tag.startsWith('~') ? exclude.add(tag.substr(1)) : include.add(tag));
  /** @type {EnvData} */
  let result = { values: {}, comments: {} };
  
  let m;
  for (let key of Object.keys(env.values)) {
    let tags = new Set(env.comments[key] && (m = env.comments[key].match(/\btags:\s*(~?[\w\d_\-]+(\s*,\s*~?[\w\d_\-]+)*)\s*($|\n)/i)) ? m[1].split(',').map(_=>_.trim()).filter(_=>!!_) : []);
    if (include.difference(tags).size === 0 && exclude.intersection(tags).size === 0) {
      result.values[key] = env.values[key];
      result.comments[key] = env.comments[key];
    }
  }
  return result;
}

function initEnv(env) {
  return env; //TODO
}


const removeColors = (str, when=true) => when ? str.replace(/\x1b\[[\d;]+m/g, '') : str;

/** @typedef {{
 * skipComments: boolean,
 *  format: 'dotenv', 'json', 'bash',
 * }} WriteContext */
/**
 * @this {WriteContext}
 * @param {EnvData} env 
 */
function writeEnv(env) {
  let out = [];
  for (let key of Object.keys(env.values)) {
    if (!this.skipComments && this.format !== 'json' && this.format !== 'docker' && typeof env.comments[key] === 'string') out.push(`\x1b[2;32m${env.comments[key]}\x1b[0m`);
    let entry = env.values[key];
    switch (this.format) {
      case 'bash': entry = `\x1b[36mexport\x1b[0m ${key}\x1b[2m=\x1b[0;2;38;5;172m'\x1b[22m${entry.replace(/'/g, `\x1b[2m'"\x1b[22m'\x1b[2m"'\x1b[22m`)}\x1b[2m'\x1b[0m`; break;
      case 'json': entry = `\x1b[2;38;5;69m"\x1b[22m${key}\x1b[2m"\x1b[0;2m: \x1b[38;5;106m"\x1b[22m${entry.replace(/(["\\])/g, `\x1b[2m\\\x1b[22m$1`)}\x1b[2m"\x1b[0m`; break;
      case 'yaml':
        if (entry.match(/^(\d+|no|fasle|yes|true|y|n)$/i)) entry = `\x1b[2m'\x1b[22m${entry}\x1b[2m'`
        else if (entry.match(/^['"']/)) {
          entry = entry.includes("'") && !entry.includes('"') ? 
            `\x1b[2m"\x1b[22m${entry.replace(/([\\"])/g, '\x1b[2m\\\x1b[22m$1')}\x1b[2m"` :
            `\x1b[2m'\x1b[22m${entry.replace(/([\\'])/g, "\x1b[2m\\\x1b[22m$1")}\x1b[2m'`;
        }
        entry = `\x1b[2m- \x1b[0;38;5;69m${key}\x1b[0;2m: \x1b[0;38;5;106m${entry}\x1b[0m`;
        break;
      case 'docker': entry = `\x1b[2m--env\x1b[22m ${key}\x1b[2m=\x1b[0;2;38;5;172m'\x1b[22m${entry.replace(/'/g, `\x1b[2m'"\x1b[22m'\x1b[2m"'\x1b[22m`)}\x1b[2m'\x1b[0m`; break;
      default: entry = `${key}\x1b[2m=\x1b[0;38;5;172m${entry}\x1b[0m`;
    }
    out.push(entry);
  }
  out = this.format === 'json' ? `{\n  ${out.join(',\n  ')}\n}` :
    this.format === 'docker' ? '  ' + out.join(process.stdout.isTTY ? ' \x1b[2m\\\x1b[22m\n  ' : ' ') :
    out.join('\n');

  if (this.outputFile === '-') {
    if (!process.stdout.isTTY) out = removeColors(out);
    console.log(out);
  }
  else writeFileSync(this.outputFile, removeColors(out) + '\n', 'utf8');
}

const opts = {
  h: 'help',
  '?': 'help',
  help() {
    console.log();
  },
  c: 'include-comments',
  'include-comments': 'includeComments',
  includeComments() { this.includeComments = true; },
  o: 'out',
  out(args) { this.outputFile = args.shift(); },
  bash() { this.format = 'bash'; },
  s: 'skip-comments',
  'skip-comments': 'skipComments',
  skipComments() { this.skipComments = true; },
  env: 'dotenv',
  dotenv() { this.format = 'dotenv'; },
  yml: 'yaml',
  yaml() { this.format = 'yaml'; },
  json() { this.format = 'json'; },
  docker() { this.format = 'docker'; },
  t: 'tags',
  x() { this.stacktrace = true; },
  tags(args) { this.tags.push(...args.shift().split(',').map(_=>_.trim()).filter(_=>!!_)); },
  merge(args) {
    let aux = args.shift();
    if (typeof aux !== 'string') throw new Error("Missing argument of option --merge");
    if (!aux.length || !(this.mergeMode = ['error','warning','ignore'].find(it => it.startsWith(aux)))) {
      throw new Error(`Invalid argument of option --merge=\x1b[31m${aux}\x1b[0m`);
    }
  },
  _long(c) {
    while (typeof this[c] === 'string') c = this[c];
    if (typeof this[c] === 'function') return c;
    else throw new Error(`Unknown option -${c}`);
  },
  _apply(c, ctx, args) {
    while (typeof this[c] === 'string') c = this[c];
    if (typeof this[c] === 'function') {
      let aux = args.length;
      this[c].call(ctx, args);
      return aux - args.length;
    }
    else throw new Error(`Unknown option --${c}`);
  },
};

if (require.main === module) {
  /** @type {MergeContext & WriteContext} */
  let ctx = {
    format: 'dotenv',
    mergeMode: 'include',
    outputFile: '-',
    initMode: 'none', // 'inspect', 'auto'
    skipComments: false,
    stacktrace: false,
    tags: [],
    color: 'auto',
  };
  try {
    let m, args = process.argv.slice(2);
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--') { args.splice(i, 1); break; }
      if (m = args[i].match(/^(-{1,2})([\w\d][\w\d-_]*)(?:=(.*))?$/)) {
        if (m[3] !== undefined) args.splice(i, 1, m[1] + m[2], m[3]);
        if (m[1] === '-' && m[2].length > 1) {
          args.splice(i--, 1, ...m[2].split('').map(_=>`--${opts._long(_)}`));
          continue;
        }
        let remove = 1 + opts._apply(m[2], ctx, args.slice(i + 1));
        args.splice(i--, remove);
      }
    }
    if (args.length === 0) args.push('.env');
    let env = args.map(loadEnv).reduce(mergeEnv.bind(ctx));
    for (let transform of [filterEnv, initEnv, writeEnv]) env = transform.call(ctx, env);
  } catch (e) {
    if (ctx.stacktrace) console.error(e);
    else console.error(removeColors(`\x1b[1;31mError:\x1b[0m ${e.message}`, !process.stderr.isTTY));
  }
}
else {
  Object.assign(exports, {loadEnv, mergeEnv, writeEnv, initEnv});
}
