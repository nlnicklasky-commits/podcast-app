export function parseOPML(xmlString) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlString, 'text/xml')

  const parseError = doc.querySelector('parsererror')
  if (parseError) {
    throw new Error('Invalid OPML file: could not parse XML')
  }

  const feeds = []
  const outlines = doc.querySelectorAll('outline')

  for (const outline of outlines) {
    const xmlUrl = outline.getAttribute('xmlUrl')
    if (!xmlUrl) continue

    feeds.push({
      title: outline.getAttribute('text') || outline.getAttribute('title') || '',
      feedUrl: xmlUrl,
      htmlUrl: outline.getAttribute('htmlUrl') || '',
      type: outline.getAttribute('type') || 'rss',
    })
  }

  return feeds
}

export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsText(file)
  })
}
