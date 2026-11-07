import mongoose from 'mongoose';
const { Schema } = mongoose;

export const Hotel = mongoose.model('Hotel', new Schema({
  name: { type: String, required: true },
  city: String,
  description: String,
  image: String,
  amenities: [String],
  isActive: { type: Boolean, default: true },
}, { timestamps: true }));

// One document represents a room in the MongoDB hotel catalog.
export const Room = mongoose.model('Room', new Schema({
  hotel: { type: Schema.Types.ObjectId, required: true, index: true },
  name: { type: String, required: true },
  type: String,
  description: String,
  image: String,
  capacity: { type: Number, default: 2 },
  pricePerNightCents: { type: Number, required: true, min: 0 },
  isActive: { type: Boolean, default: true },
}, { timestamps: true }));
