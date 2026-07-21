export const FW = Object.create(null);

export function expose(values) {
  Object.assign(FW, values);
  return values;
}

