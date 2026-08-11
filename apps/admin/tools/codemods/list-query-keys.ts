/**
 * Diagnostic codemod: List all React Query keys and their locations.
 *
 * Usage:
 *   npx jscodeshift -t tools/codemods/list-query-keys.ts src/ --dry --parser=tsx
 *
 * Output: queryKey → [file:line] for every useQuery / invalidateQueries / cancelQueries call
 */

import type { FileInfo, API } from 'jscodeshift';

export default function transformer(file: FileInfo, api: API) {
  const j = api.jscodeshift;
  const root = j(file.source);

  root
    .find(j.CallExpression)
    .filter((path) => {
      const callee = path.node.callee;
      // useQuery({ queryKey: [...] })  or  useQuery({ ..., queryKey: [...] })
      if (callee.type === 'Identifier' && callee.name === 'useQuery') return true;
      // qc.invalidateQueries({ queryKey: [...] })  or any .invalidateQueries(...)
      if (
        callee.type === 'MemberExpression' &&
        (callee.property as any)?.name === 'invalidateQueries'
      )
        return true;
      if (
        callee.type === 'MemberExpression' &&
        (callee.property as any)?.name === 'cancelQueries'
      )
        return true;
      if (
        callee.type === 'MemberExpression' &&
        (callee.property as any)?.name === 'getQueryData'
      )
        return true;
      if (
        callee.type === 'MemberExpression' &&
        (callee.property as any)?.name === 'setQueryData'
      )
        return true;
      return false;
    })
    .forEach((path) => {
      const arg = (path.node.arguments as any[])?.[0];
      if (!arg || arg.type !== 'ObjectExpression') return;

      const queryKeyProp = arg.properties.find(
        (p: any) => p.key?.name === 'queryKey' || p.key?.value === 'queryKey',
      );
      if (!queryKeyProp || (queryKeyProp as any).value?.type !== 'ArrayExpression')
        return;

      const elements = (queryKeyProp as any).value.elements;
      const keyParts = elements.map((e: any) => {
        if (e.type === 'StringLiteral') return JSON.stringify(e.value);
        if (e.type === 'Identifier') return e.name;
        return '?';
      });

      const callee = path.node.callee;
      let method = 'unknown';
      if (callee.type === 'Identifier') method = callee.name;
      if (callee.type === 'MemberExpression') method = (callee.property as any)?.name;

      console.log(`[${keyParts.join(', ')}]  ← ${method}()  ${file.path}:${path.node.loc?.start.line}`);
    });

  return root.toSource();
}
