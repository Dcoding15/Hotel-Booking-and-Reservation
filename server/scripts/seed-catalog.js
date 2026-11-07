import 'dotenv/config';
import mongoose from 'mongoose';
import { Hotel, Room } from '../src/models/index.js';

if (!process.env.MONGO_URI) throw new Error('Missing MONGO_URI in server/.env');

const destinations = [
  { city: 'Kyoto, Japan', area: 'Gion lanes and temple gardens', multiplier: 1.18 },
  { city: 'Reykjavik, Iceland', area: 'harbour walks and northern-sky views', multiplier: 1.42 },
  { city: 'Cape Town, South Africa', area: 'ocean promenades and mountain trails', multiplier: 1.12 },
  { city: 'Mexico City, Mexico', area: 'historic plazas and lively neighbourhoods', multiplier: 0.88 },
  { city: 'Dubrovnik, Croatia', area: 'stone streets and Adriatic sunsets', multiplier: 1.25 },
  { city: 'Hanoi, Vietnam', area: 'old-quarter markets and lakeside cafés', multiplier: 0.76 },
  { city: 'Vancouver, Canada', area: 'waterfront paths and forested parks', multiplier: 1.3 },
  { city: 'Jaipur, India', area: 'colourful bazaars and pink-city landmarks', multiplier: 0.72 },
  { city: 'Edinburgh, Scotland', area: 'castle views and cobbled old-town streets', multiplier: 1.22 },
  { city: 'Queenstown, New Zealand', area: 'alpine trails and lakeside scenery', multiplier: 1.28 },
];

const concepts = [
  {
    name: 'Willow House',
    description: 'A thoughtfully restored boutique stay with warm natural materials and a relaxed, intimate atmosphere.',
    amenities: ['Wi-Fi', 'Breakfast', 'Garden'],
    basePrice: 9200,
  },
  {
    name: 'Copper & Stone Hotel',
    description: 'A contemporary city retreat pairing locally inspired design with easy access to neighbourhood dining.',
    amenities: ['Wi-Fi', 'Restaurant', 'Fitness room'],
    basePrice: 11800,
  },
  {
    name: 'Bluebird Grand',
    description: 'A full-service hotel with welcoming shared spaces, attentive service, and comfortable rooms for every stay.',
    amenities: ['Wi-Fi', 'Pool', 'Room service'],
    basePrice: 15400,
  },
  {
    name: 'Stillwater Lodge',
    description: 'A peaceful lodge designed for slow mornings, scenic strolls, and restful evenings away from the crowds.',
    amenities: ['Wi-Fi', 'Spa', 'Breakfast'],
    basePrice: 13200,
  },
  {
    name: 'Market Lane Suites',
    description: 'Spacious, well-appointed suites in a walkable district close to local shops, cafés, and cultural sights.',
    amenities: ['Wi-Fi', 'Kitchenette', 'Laundry'],
    basePrice: 10800,
  },
];

const roomTypes = [
  { name: 'Classic Double', type: 'Double', capacity: 2, multiplier: 1 },
  { name: 'Deluxe King', type: 'King', capacity: 2, multiplier: 1.42 },
  { name: 'Signature Suite', type: 'Suite', capacity: 4, multiplier: 1.95 },
];
const imageUrl = (seed) => `https://picsum.photos/seed/${encodeURIComponent(seed)}/900/600`;

await mongoose.connect(process.env.MONGO_URI);
let hotelsAdded = 0;
let roomsAdded = 0;

try {
  for (let destinationIndex = 0; destinationIndex < destinations.length; destinationIndex++) {
    const destination = destinations[destinationIndex];
    for (let conceptIndex = 0; conceptIndex < concepts.length; conceptIndex++) {
      const concept = concepts[conceptIndex];
      const name = `${concept.name} ${destinationIndex + 1}`;
      let hotel = await Hotel.findOne({ name, city: destination.city });

      if (!hotel) {
        hotel = await Hotel.create({
          name,
          city: destination.city,
          description: `${concept.description} Explore ${destination.area}.`,
          image: imageUrl(`roomkey-${destinationIndex}-${conceptIndex}-hotel`),
          amenities: concept.amenities,
          isActive: true,
        });
        hotelsAdded++;
      }

      for (let roomIndex = 0; roomIndex < roomTypes.length; roomIndex++) {
        const roomType = roomTypes[roomIndex];
        const roomName = `${roomType.name} ${destinationIndex + 1}`;
        const exists = await Room.exists({ hotel: hotel._id, name: roomName });
        if (exists) continue;

        const pricePerNightCents = Math.round(
          concept.basePrice * destination.multiplier * roomType.multiplier,
        );
        await Room.create({
          hotel: hotel._id,
          name: roomName,
          type: roomType.type,
          description: `${roomType.type} room for up to ${roomType.capacity}, with a comfortable base for exploring ${destination.area}.`,
          image: imageUrl(`roomkey-${destinationIndex}-${conceptIndex}-room-${roomIndex}`),
          capacity: roomType.capacity,
          pricePerNightCents,
          isActive: true,
        });
        roomsAdded++;
      }
    }
  }
} finally {
  await mongoose.disconnect();
}

console.log(`Catalog seed complete: added ${hotelsAdded} hotels and ${roomsAdded} rooms.`);
