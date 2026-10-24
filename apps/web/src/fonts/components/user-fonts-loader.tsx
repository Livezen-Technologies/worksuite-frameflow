"use client";

import { useEffect } from "react";
import { loadUserFonts } from "../user-fonts";

/** Loads imported fonts when the app starts. */
export function UserFontsLoader() {
	useEffect(() => {
		void loadUserFonts();
	}, []);
	return null;
}
