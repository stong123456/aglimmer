import { Children, cloneElement, isValidElement, type ReactNode, type ReactElement } from 'react';
import { translate, type Locale } from './i18n.ts';
export function translateView(children: ReactNode, locale: Locale): ReactNode {
  function visit(value: ReactNode): ReactNode {
    if (typeof value === 'string') return translate(value, locale);
    if (!isValidElement(value)) return value;
    const element = value as ReactElement<Record<string, unknown>>;
    if (element.props['data-original']) return element;
    const props: Record<string, unknown> = {};
    if (typeof element.type === 'string') {
      for (const key of ['placeholder', 'title', 'aria-label', 'alt'])
        if (typeof element.props[key] === 'string')
          props[key] = translate(element.props[key] as string, locale);
      if (
        element.type === 'option' &&
        element.props.value === undefined &&
        typeof element.props.children === 'string'
      )
        props.value = element.props.children;
    }
    if (element.props.children !== undefined)
      props.children = Children.map(element.props.children as ReactNode, visit);
    return cloneElement(element, props);
  }
  return Children.map(children, visit);
}
