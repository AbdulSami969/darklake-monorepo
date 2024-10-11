use groth16_solana::groth16::Groth16Verifyingkey;

pub const VERIFYINGKEY: Groth16Verifyingkey =  Groth16Verifyingkey {
	nr_pubinputs: 4,

	vk_alpha_g1: [
		22,184,82,43,251,173,24,249,220,191,156,184,102,88,56,109,52,50,24,144,181,98,173,106,144,8,174,121,20,34,77,110,
		32,224,246,194,237,231,247,227,244,158,248,4,245,117,28,240,222,31,119,229,171,191,33,243,54,215,119,189,222,91,104,142,
	],

	vk_beta_g2: [
		33,130,157,216,18,230,178,16,139,18,132,142,132,12,97,43,205,184,225,81,70,124,13,196,107,231,252,160,54,19,19,151,
		17,4,37,201,121,232,161,121,33,24,239,168,211,250,223,53,232,1,237,91,113,80,92,220,140,151,235,169,79,22,56,229,
		31,17,68,3,243,143,3,64,149,90,37,69,119,66,50,174,79,40,188,20,61,227,102,49,220,173,144,186,186,220,173,37,
		18,4,54,241,6,20,10,176,100,41,38,130,157,21,153,145,57,24,18,161,107,246,141,54,223,169,174,93,10,97,120,115,
	],

	vk_gamme_g2: [
		25,142,147,147,146,13,72,58,114,96,191,183,49,251,93,37,241,170,73,51,53,169,231,18,151,228,133,183,174,243,18,194,
		24,0,222,239,18,31,30,118,66,106,0,102,94,92,68,121,103,67,34,212,247,94,218,221,70,222,189,92,217,146,246,237,
		9,6,137,208,88,95,240,117,236,158,153,173,105,12,51,149,188,75,49,51,112,179,142,243,85,172,218,220,209,34,151,91,
		18,200,94,165,219,140,109,235,74,171,113,128,141,203,64,143,227,209,231,105,12,67,211,123,76,230,204,1,102,250,125,170,
	],

	vk_delta_g2: [
		27,108,36,220,246,250,217,224,247,233,196,50,34,216,229,12,200,209,213,72,143,212,160,250,61,9,230,177,118,65,161,199,
		28,97,132,229,16,114,222,53,231,129,88,179,133,247,244,184,112,122,247,14,171,132,237,191,122,50,86,227,76,31,185,250,
		14,106,112,194,113,38,64,172,46,164,2,22,132,85,97,174,128,237,79,229,79,86,12,156,186,163,234,105,137,12,79,118,
		26,24,158,99,117,187,181,252,184,70,169,98,106,29,13,188,99,99,69,245,2,101,12,175,144,237,190,224,44,163,122,108,
	],

	vk_ic: &[
		[
			31,16,224,153,65,115,132,119,160,193,212,228,141,189,25,224,74,251,241,113,94,187,254,240,25,137,35,160,109,216,26,141,
			47,100,50,11,75,238,147,51,221,70,133,128,15,129,17,224,209,117,195,193,76,65,133,221,61,26,10,223,136,148,167,89,
		],
		[
			0,95,135,5,80,75,231,132,60,152,114,39,187,3,254,195,46,254,145,192,133,225,186,184,9,249,51,32,132,153,108,235,
			9,15,70,57,69,0,15,36,88,26,31,61,30,215,218,148,58,112,35,101,94,228,144,171,113,210,90,118,20,25,16,209,
		],
		[
			6,218,135,224,63,93,74,202,246,250,152,209,160,227,58,148,136,199,196,42,141,194,152,167,90,182,18,109,218,136,155,84,
			19,10,142,87,192,88,100,68,78,214,187,44,21,43,161,14,110,58,94,87,196,135,92,245,219,211,74,236,114,61,178,18,
		],
		[
			23,176,98,99,55,89,82,250,198,141,16,221,114,243,139,24,65,165,216,193,21,239,27,41,52,230,249,100,74,211,81,227,
			3,28,106,192,178,16,184,99,16,24,118,106,93,203,42,159,94,154,128,145,40,255,128,185,252,40,194,201,106,233,205,50,
		],
	]
};