import type { IDataObject, INodeProperties } from '@runnel/workflow';

/** The displayOptions show/hide semantics: a property is visible only if every `show` condition matches the sibling values, and no `hide` condition matches. */
export function isPropertyVisible(property: INodeProperties, values: IDataObject): boolean {
  const { show, hide } = property.displayOptions ?? {};

  if (show) {
    for (const [key, allowed] of Object.entries(show)) {
      if (!allowed.includes(values[key] as string | number | boolean)) return false;
    }
  }

  if (hide) {
    for (const [key, disallowed] of Object.entries(hide)) {
      if (disallowed.includes(values[key] as string | number | boolean)) return false;
    }
  }

  return true;
}
