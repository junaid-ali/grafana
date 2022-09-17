import React, { HTMLAttributes, PropsWithChildren } from 'react';

export interface RenderUserContentAsHTMLProps extends Omit<HTMLAttributes<HTMLElement>, 'dangerouslySetInnerHTML'> {
  component?: React.ElementType;
  content: string;
}

export function RenderUserContentAsHTML({
  component,
  content,
  ...rest
}: PropsWithChildren<RenderUserContentAsHTMLProps>): JSX.Element {
  return React.createElement(component || 'span', {
    dangerouslySetInnerHTML: { __html: content },
    ...rest,
  });
}
