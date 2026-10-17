import { htmlToBlocks } from './html';

describe('htmlToBlocks', () => {
  it('turns paragraphs and list items into text blocks', () => {
    expect(
      htmlToBlocks(
        '<p>We build <strong>APIs</strong>.</p><ul><li>Node.js</li><li>Postgres</li></ul>',
      ),
    ).toEqual([
      { kind: 'paragraph', text: 'We build APIs.' },
      { kind: 'bullet', text: 'Node.js' },
      { kind: 'bullet', text: 'Postgres' },
    ]);
  });

  it('drops scripts and styles entirely, and decodes entities to plain text', () => {
    const blocks = htmlToBlocks(
      '<script>alert(1)</script><style>p{}</style><p>R&amp;D &lt;team&gt;</p>',
    );
    expect(blocks).toEqual([{ kind: 'paragraph', text: 'R&D <team>' }]);
  });

  it('keeps "<img onerror>" as harmless text once decoded, because React renders text, not HTML', () => {
    const blocks = htmlToBlocks('<p>&lt;img src=x onerror=alert(1)&gt;</p>');
    expect(blocks[0]?.text).toBe('<img src=x onerror=alert(1)>');
  });
});
