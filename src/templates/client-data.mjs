// Compact per-vehicle record sent to the browser for the compare tool and filters.
export const clientCar = (c) => ({ id: c.id, slug: c.slug, name: c.name, make: c.make, year: c.year, mileage: c.mileage, price: c.priceTzs, usd: c.priceUsd, body: c.body, colour: c.colour, hex: c.colourHex, chassis: c.chassis, auction: c.auction, status: c.status, thumb: c.thumb });
