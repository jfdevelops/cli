import picomatch from 'picomatch';

// Names npm leaves out of every tarball, whatever the package's files field says.
const alwaysIgnoredNames = [
  '.git',
  '.svn',
  '.hg',
  'CVS',
  '.npmrc',
  '.npmignore',
  '.gitignore',
  '.DS_Store',
  '._*',
  '.*.swp',
  '*.orig',
  'npm-debug.log',
  'node_modules',
  'package-lock.json',
];

const isIgnoredName = picomatch(alwaysIgnoredNames, { dot: true });

export function isIgnoredByNpm(path: string) {

  return path.split('/').some((segment) => isIgnoredName(segment));
}
