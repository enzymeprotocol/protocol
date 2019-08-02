import * as fs from 'fs';
import * as path from 'path';
import * as glob from 'glob';
import * as solc from 'solc';
import * as mkdirp from 'mkdirp';
import * as R from 'ramda';
import * as rimraf from 'rimraf';
import syncRequest from 'sync-request';

const soliditySourceDirectory = path.join(__dirname, '..', 'src', 'contracts');
const solidityCompileTarget = path.join(__dirname, '..', 'out');

// TODO: A more standard way to integrate vyper contracts
/* tslint:disable:max-line-length */
const externalContractFiles = [
  {
    contractName: 'UniswapExchange',
    abiDownloadUrl:
      'https://raw.githubusercontent.com/Uniswap/contracts-vyper/master/abi/uniswap_exchange.json',
    binDownloadUrl:
      'https://raw.githubusercontent.com/Uniswap/contracts-vyper/master/bytecode/exchange.txt',
  },
  {
    contractName: 'UniswapFactory',
    abiDownloadUrl:
      'https://raw.githubusercontent.com/Uniswap/contracts-vyper/master/abi/uniswap_factory.json',
    binDownloadUrl:
      'https://raw.githubusercontent.com/Uniswap/contracts-vyper/master/bytecode/factory.txt',
  },
];
/* tslint:enable:max-line-length */

const debug = require('debug').default('melon:protocol:bin');

const findImports = (missingPath: string, b, c) => {
  const query = path.join(soliditySourceDirectory, '**', missingPath);
  const candidates = glob.sync(query);

  if (candidates.length > 1) {
    throw new Error(
      `Multiple source files named ${missingPath} found. ${candidates}`,
    );
  }

  if (candidates.length === 0) {
    throw new Error(`Can not find import named: ${missingPath}`);
  }

  debug('Resolved import', missingPath, candidates[0]);

  const contents = fs.readFileSync(candidates[0], { encoding: 'utf-8' });

  return {
    contents,
  };
};

const writeFiles = (compileOutput, contract) => {
  const [sourceName, contractName] = contract.split(':');
  const parsedPath = path.parse(sourceName);
  const targetDir = path.join(solidityCompileTarget, parsedPath.dir);
  const targetBasePath = path.join(targetDir, contractName);

  debug('Writing', contract);

  mkdirp.sync(targetDir);

  if (fs.existsSync(`${targetBasePath}.abi`)) {
    console.warn(
      // tslint:disable-next-line:max-line-length
      `Contract name duplication detected: ${targetBasePath}.abi. Please make sure that every contract is uniquely named across all dirctories.`,
    );
  }

  fs.writeFileSync(`${targetBasePath}.bin`, compileOutput.bytecode);
  fs.writeFileSync(
    `${targetBasePath}.abi.json`,
    JSON.stringify(JSON.parse(compileOutput.interface), null, 2),
  );
  fs.writeFileSync(`${targetBasePath}.abi`, compileOutput.interface);
  fs.writeFileSync(
    `${targetBasePath}.gasEstimates.json`,
    JSON.stringify(compileOutput.gasEstimates, null, 2),
  );
};

const downloadAndWriteFile = (fileUrl, fileName, isAbi = false) => {
  const targetPath = path.join(solidityCompileTarget, fileName);
  const res = syncRequest('GET', fileUrl);
  fs.writeFileSync(targetPath, res.body);

  if (isAbi) {
    const abiJsonPath = path.join(solidityCompileTarget, `${fileName}.json`);
    fs.writeFileSync(
      abiJsonPath,
      JSON.stringify(JSON.parse(res.body.toString()), null, 2),
    );
  }
};

export const compileGlob = (
  query = path.join(soliditySourceDirectory, '**', '*.sol'),
) => {
  const candidates = glob.sync(query);

  debug(`Compiling ${query}, ${candidates.length} files ...`);

  const unmerged = candidates.map(source => ({
    [path.basename(source)]: fs.readFileSync(source, {
      encoding: 'utf-8',
    }),
  }));

  const sources = R.mergeAll(unmerged);

  const output = solc.compile({ sources }, 1, findImports);

  const messages = output.errors;
  const errors = [];
  const warnings = [];
  messages.forEach(msg => {
    if (msg.match(/^(.*:[0-9]*:[0-9]* )?Warning: /)) {
      warnings.push(msg);
    } else {
      errors.push(msg);
    }
    process.stderr.write(msg);
  });

  debug('Writing compilation results');

  if (query === path.join(soliditySourceDirectory, '**', '*.sol')) {
    // Delete and recreate out/
    rimraf.sync(solidityCompileTarget);
    mkdirp.sync(solidityCompileTarget);
  }

  fs.writeFileSync(
    path.join(solidityCompileTarget, 'compilerResult.json'),
    JSON.stringify(output, null, 2),
  );

  if (messages.length > 0) {
    fs.writeFileSync(
      path.join(solidityCompileTarget, 'compilerMessages.txt'),
      output.errors.join('\n\n'),
    );
  }

  R.forEachObjIndexed(writeFiles, output.contracts);

  console.log('\n\n Downloading external Uniswap contract codes');
  externalContractFiles.forEach(file => {
    downloadAndWriteFile(file.abiDownloadUrl, `${file.contractName}.abi`, true);
    downloadAndWriteFile(file.binDownloadUrl, `${file.contractName}.bin`);
  });

  if (errors.length > 0) {
    debug('Finished with errors');
    process.stderr.write(errors.join('\n\n'));
    process.exit(1);
  } else {
    debug('Finished');
    process.exit(0);
  }
};
