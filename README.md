# Brooklyn Catholic Parishes Timeline

An interactive historical map of Catholic parishes in Brooklyn (Kings County), NY from 1822 to present.

## Features

- **Interactive Map** - View all 134 Brooklyn Catholic parishes on a dark-themed map
- **Timeline Filter** - Slide through history to see which parishes existed in any year range
- **Language/Origin Filter** - Filter by ethnic parishes (German, Polish, Italian, Slovak, French, Lithuanian)
- **Parish Search** - Find parishes by name
- **Address Lookup** - Enter any Brooklyn address to find which parish it belongs to (uses Voronoi boundaries)
- **Parish Boundaries** - Toggle estimated catchment areas based on Voronoi diagrams

## Usage

Simply open `brooklyn-parishes.html` in any modern web browser. No installation or server required.

## Data Source

Parish data compiled from the [Irish Family History Forum](https://ifhf.org/wp-content/uploads/2019/09/brooklyn-parishes.pdf).

## Technologies

- [Leaflet](https://leafletjs.com/) - Interactive maps
- [Turf.js](https://turfjs.org/) - Geospatial analysis (Voronoi boundaries)
- [OpenStreetMap Nominatim](https://nominatim.openstreetmap.org/) - Address geocoding
- [CARTO](https://carto.com/) - Dark map tiles

## License

MIT License - See [LICENSE](LICENSE) file for details.

