module.exports =
[
  {
    name: 'help',
    alias: 'h',
    type: Boolean,
    description: 'Display this usage guide.'
  },
  {
    name: 'version',
    alias: 'v',
    type: Boolean,
    description: 'Print version info'
  },
  {
    name: 'token',
    alias: 't',
    type: String,
    description: 'Quip Access Token. To generate a personal access token, visit the page: <https://quip.com/dev/token>',
    typeLabel: '{underline string}'
  },
  {
    name: 'destination',
    alias: 'd',
    type: String,
    description: 'Destination folder for export files',
    typeLabel: '{underline string}'
  },
  {
    name: 'zip',
    alias: 'z',
    type: Boolean,
    description: 'Zip export files'
  },
  {
    name: 'embedded-styles',
    type: Boolean,
    description: 'Embedded in each document stylesheet'
  },
  {
      name: 'embedded-images',
      type: Boolean,
      description: 'Embedded images'
  },
  {
    name: 'docx',
    type: Boolean,
    description: 'Exports documents in *.docx and spreadsheets in *.xlsx format'
  },
  {
    name: 'html',
    type: Boolean,
    description: 'Exports documents in HTML format (default when no format specified)'
  },
  {
    name: 'comments',
    type: Boolean,
    description: 'Includes comments (messages) for the documents'
  },
  {
    name: 'folders',
    type: String,
    description: 'Comma-separated folder\'s IDs to export',
    typeLabel: '{underline string}'
  },
  {
    name: 'debug',
    type: Boolean,
    description: 'Debug mode'
  },
  {
    name: 'base-url',
    type: String,
    description: 'Custom base URL for Quip (e.g., "quip-acme.com")',
    typeLabel: '{underline string}'
  },
  {
    name: 'lock',
    type: Boolean,
    description: 'Lock threads after exporting them'
  },
  {
    name: 'title-prefix',
    type: String,
    description: 'Prefix to add to document titles before locking',
    typeLabel: '{underline string}'
  }
];
