import { expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readHeifMeta } from "../boxes";
import { hevcStillFromMp4, writeHeic } from "../write";

test("repackages an HEVC frame as a cropped HEIC (HE-10)", () => {
	const mp4 = new Uint8Array(readFileSync(join(import.meta.dir, "fixtures", "still.mp4")));
	const still = hevcStillFromMp4(mp4);
	expect([still.width, still.height]).toEqual([328, 184]);
	const heic = writeHeic({ still, crop: { width: 322, height: 182 } });
	const meta = readHeifMeta(heic);
	const item = meta?.items.get(meta.primaryId);
	expect(item?.type).toBe("hvc1");
	expect(item?.properties.map((p) => p.type)).toEqual(["hvcC", "ispe", "colr-nclx", "clap"]);
	const [extent] = item?.extents ?? [];
	expect([...heic.subarray(extent.offset, extent.offset + 16)]).toEqual([...still.data.subarray(0, 16)]);
	if (process.env.HEIC_OUT) writeFileSync(process.env.HEIC_OUT, heic);
});
