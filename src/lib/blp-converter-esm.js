/*!
	js-blp (https://github.com/Kruithne/js-blp)
	Author: Kruithne <kruithne@gmail.com>
	License: MIT
*/

export class Bufo {
	constructor(data) {
		if (data instanceof ArrayBuffer) {
			this._buffer = new Uint8Array(data);
			this._view = new DataView(data);
		} else if (Array.isArray(data)) {
			this._buffer = new Uint8Array(data);
			this._view = new DataView(this._buffer.buffer);
		} else if (data instanceof Uint8Array) {
			this._buffer = data;
			this._view = new DataView(data.buffer);
		} else if (typeof data === 'number') {
			this._buffer = new Uint8Array(data);
			this._view = new DataView(this._buffer.buffer);
		} else {
			throw new Error('Unsupported Bufo input');
		}
		this._pos = 0;
	}
	readUInt32(count = 1) {
		if (count === 1) {
			const val = this._view.getUint32(this._pos, true);
			this._pos += 4;
			return val;
		}
		const arr = [];
		for (let i = 0; i < count; i++) arr.push(this.readUInt32());
		return arr;
	}
	readUInt8(count = 1) {
		if (count === 1) {
			return this._buffer[this._pos++];
		}
		const arr = [];
		for (let i = 0; i < count; i++) arr.push(this.readUInt8());
		return arr;
	}
	seek(pos) {
		this._pos = pos;
	}
	writeUInt8(arr) {
		for (let v of arr) this._buffer[this._pos++] = v;
	}
	get length() {
		return this._buffer.length;
	}
	get buffer() {
		return this._buffer;
	}
}

class BLPError extends Error {
	constructor(message, ...args) {
		message = 'BLPFile: ' + message.replace(/{(\d+)}/g, (match, number) => {
			return typeof args[number] !== 'undefined' ? args[number] : match;
		});

		super(message);
		this.stack = (new Error(message)).stack;
		this.name = this.constructor.name;
	}
}

export class BLPFile {
	static get DXT1() {
		return 0x1;
	}

	static get DXT3() {
		return 0x2;
	}

	static get DXT5() {
		return 0x4;
	}

	constructor(data) {
		this.data = new Bufo(data);

		if (this.data.readUInt32() !== 0x32504c42)
			throw new BLPError('Provided data is not a BLP file (invalid header magic).');

		let type = this.data.readUInt32();
		if (type !== 1)
			throw new BLPError('Unsupported BLP type ({0} !== 1)', type);

		this.encoding = this.data.readUInt8();
		this.alphaDepth = this.data.readUInt8();
		this.alphaEncoding = this.data.readUInt8();
		this.containsMipmaps = this.data.readUInt8();

		this.width = this.data.readUInt32();
		this.height = this.data.readUInt32();

		this.mapOffsets = this.data.readUInt32(16);
		this.mapSizes = this.data.readUInt32(16);

		this.mapCount = 0;
		for (let ofs of this.mapOffsets)
			if (ofs !== 0)
				this.mapCount++;

		this.palette = [];
		if (this.encoding === 1)
			for (let i = 0; i < 256; i++)
				this.palette[i] = this.data.readUInt8(4);
	}

	getPixels(mipmap, canvas = null) {
		mipmap = Math.max(0, Math.min(mipmap || 0, this.mapCount - 1));

		this.scale = Math.pow(2, mipmap);
		this.scaledWidth = this.width / this.scale;
		this.scaledHeight = this.height / this.scale;
		this.scaledLength = this.scaledWidth * this.scaledHeight;

		this.data.seek(this.mapOffsets[mipmap]);
		this.rawData = this.data.readUInt8(this.mapSizes[mipmap]);

		if (canvas !== null) {
			this.imageContext = canvas.getContext('2d');
			this.imageData = this.imageContext.createImageData(this.scaledWidth, this.scaledHeight);
		}

		let out;
		switch (this.encoding) {
			case 1:
				out = this._getUncompressed();
				break;
			case 2:
				out = this._getCompressed();
				break;
			case 3:
				out = this._marshalBGRA();
				break;
		}

		if (canvas !== null) {
			this.imageContext.putImageData(this.imageData, 0, 0);
			return this.imageContext;
		}
		return out;
	}

	_getAlpha(index) {
		let byte;
		switch (this.alphaDepth) {
			case 1:
				byte = this.rawData[this.scaledLength + (index / 8)];
				return (byte & (0x01 << (index % 8))) === 0 ? 0x00 : 0xFF;
			case 4:
				byte = this.rawData[this.scaledLength + (index / 2)];
				return (index % 2 === 0 ? (byte & 0x0F) << 4 : byte & 0xF0);
			case 8:
				return this.rawData[this.scaledLength + index];
			default:
				return 0xFF;
		}
	}

	_getCompressed() {
		let flags = this.alphaDepth > 1 ? (this.alphaEncoding === 7 ? BLPFile.DXT5 : BLPFile.DXT3) : BLPFile.DXT1;
		let data = this.imageData ? this.imageData.data : new Array(this.scaledWidth * this.scaledHeight * 4);

		let pos = 0;
		let blockBytes = (flags & BLPFile.DXT1) !== 0 ? 8 : 16;
		let target = new Array(4 * 16);

		for (let y = 0; y < this.scaledHeight; y += 4) {
			for (let x = 0; x < this.scaledWidth; x += 4) {
				let blockPos = 0;

				if (this.rawData.length === pos)
					continue;

				let colourIndex = pos;
				if ((flags & (BLPFile.DXT3 | BLPFile.DXT5)) !== 0)
					colourIndex += 8;

				let isDXT1 = (flags & BLPFile.DXT1) !== 0;
				let colours = [];
				let a = BLPFile._unpackColour(this.rawData, colourIndex, 0, colours, 0);
				let b = BLPFile._unpackColour(this.rawData, colourIndex, 2, colours, 4);

				for (let i = 0; i < 3; i++) {
					let c = colours[i];
					let d = colours[i + 4];

					if (isDXT1 && a <= b) {
						colours[i + 8] = (c + d) / 2;
						colours[i + 12] = 0;
					} else {
						colours[i + 8] = (2 * c + d) / 3;
						colours[i + 12] = (c + 2 * d) / 3;
					}
				}

				colours[8 + 3] = 255;
				colours[12 + 3] = (isDXT1 && a <= b) ? 0 : 255;

				let index = [];
				for (let i = 0; i < 4; i++) {
					let packed = this.rawData[colourIndex + 4 + i];
					index[i * 4] = packed & 0x3;
					index[1 + i * 4] = (packed >> 2) & 0x3;
					index[2 + i * 4] = (packed >> 4) & 0x3;
					index[3 + i * 4] = (packed >> 6) & 0x3;
				}

				for (let i = 0; i < 16; i++) {
					let ofs = index[i] * 4;
					target[4 * i] = colours[ofs];
					target[4 * i + 1] = colours[ofs + 1];
					target[4 * i + 2] = colours[ofs + 2];
					target[4 * i + 3] = colours[ofs + 3];
				}

				if ((flags & BLPFile.DXT3) !== 0) {
					for (let i = 0; i < 8; i++) {
						let quant = this.rawData[pos + i];

						let low = (quant & 0x0F);
						let high = (quant & 0xF0);

						target[8 * i + 3] = (low | (low << 4));
						target[8 * i + 7] = (high | (high >> 4));
					}
				} else if ((flags & BLPFile.DXT5) !== 0) {
					let a0 = this.rawData[pos];
					let a1 = this.rawData[pos + 1];

					let colours = [];
					colours[0] = a0;
					colours[1] = a1;

					if (a0 <= a1) {
						for (let i = 1; i < 5; i++)
							colours[i + 1] = (((5 - i) * a0 + i * a1) / 5) | 0;

						colours[6] = 0;
						colours[7] = 255;
					} else {
						for (let i = 1; i < 7; i++)
							colours[i + 1] = (((7 - i) * a0 + i * a1) / 7) | 0;

					}

					let indices = [];
					let blockPos = 2;
					let indicesPos = 0;

					for (let i = 0; i < 2; i++) {
						let value = 0;
						for (let j = 0; j < 3; j++) {
							let byte = this.rawData[pos + blockPos++];
							value |= (byte << 8 * j);
						}

						for (let j = 0; j < 8; j++)
							indices[indicesPos++] = (value >> 3 * j) & 0x07;
					}

					for (let i = 0; i < 16; i++)
						target[4 * i + 3] = colours[indices[i]];
				}

				for (let pY = 0; pY < 4; pY++) {
					for (let pX = 0; pX < 4; pX++) {
						let sX = x + pX;
						let sY = y + pY;

						if (sX < this.scaledWidth && sY < this.scaledHeight) {
							let pixel = 4 * (this.scaledWidth * sY + sX);
							for (let i = 0; i < 4; i++)
								data[pixel + i] = target[blockPos + i];
						}
						blockPos += 4;
					}
				}

				pos += blockBytes;
			}
		}
		return this.imageContext ? data : new Bufo(data);
	}

	_getUncompressed() {
		if (this.imageData) {
			let data = this.imageData.data;
			for (let i = 0; i < this.scaledLength; i++) {
				let ofs = i * 4;
				let colour = this.palette[this.rawData[i]];

				data[ofs] = colour[2];
				data[ofs + 1] = colour[1];
				data[ofs + 2] = colour[0];
				data[ofs + 3] = this._getAlpha(i);
			}

			return this.imageData;
		}
		let buf = new Bufo(this.scaledLength * 4);
		for (let i = 0; i < this.scaledLength; i++) {
			let colour = this.palette[this.rawData[i]];
			buf.writeUInt8([colour[2], colour[1], colour[0], this._getAlpha(i)]);
		}
		buf.seek(0);
		return buf;
	}

	static _unpackColour(block, index, ofs, colour, colourOfs) {
		let value = block[index + ofs] | (block[index + 1 + ofs] << 8);

		let r = (value >> 11) & 0x1F;
		let g = (value >> 5) & 0x3F;
		let b = value & 0x1F;

		colour[colourOfs] = (r << 3) | (r >> 2);
		colour[colourOfs + 1] = (g << 2) | (g >> 4);
		colour[colourOfs + 2] = (b << 3) | (b >> 2);
		colour[colourOfs + 3] = 255;

		return value;
	}

	_marshalBGRA() {
		if (this.imageData) {
			let out = this.imageData.data;
			let count = this.rawData.length / 4;
			for (let i = 0; i < count; i++) {
				let ofs = i * 4;
				out[ofs] = this.rawData[ofs + 2];
				out[ofs + 1] = this.rawData[ofs + 1];
				out[ofs + 2] = this.rawData[ofs];
				out[ofs + 3] = this.rawData[ofs + 3];
			}

			return this.imageData;
		}
		let buf = new Bufo(this.rawData.length);
		let count = this.rawData.length / 4;
		for (let i = 0; i < count; i++) {
			let ofs = i * 4;
			buf.writeUInt8([
				this.rawData[ofs + 2], this.rawData[ofs + 1], this.rawData[ofs], this.rawData[ofs + 3]
			]);
		}
		buf.seek(0);
		return buf;
	}
}
