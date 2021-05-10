type Arg = { [key: string]: any };

export const sortKeys = <T extends Arg>(obj: T): T => {
  return Object.keys(obj)
    .sort()
    .reduce((total: any, current: string) => {
      total[current] = obj[current];

      return total as T;
    }, {} as T);
};
