import { PackageJson } from 'list';
import { sortKeys } from 'utils';

console.log('Hello World!');

const beautifyPackageJson = (packageJson: PackageJson) => {
  if (packageJson.dependencies) {
    packageJson.dependencies = sortKeys(packageJson.dependencies);
  }

  if (packageJson.devDependencies) {
    packageJson.devDependencies = sortKeys(packageJson.devDependencies);
  }
};
