export type PackageEntry = {
  packageId: string;
  name: string;
  version: string;
};

export type ClosureInput = {
  version: string;
  sourcePins: Array<{ id: string; repository: string; commit: string }>;
  artifacts: Array<{
    id: string;
    name: string;
    version: string;
    sourcePinId: string;
    darSha256: string;
    mainPackageId: string;
    manifestSha256: string;
    packages: PackageEntry[];
  }>;
  selectablePackageNames: string[];
  graphPackages: PackageEntry[];
};

const damlPrimA =
  "11978acf1971ebffa32ef626228faaf06526c0693e80117558f2abc795274368";
export const damlPrimB =
  "54f85ebfc7dfae18f7d70370015dcc6c6792f60135ab369c44ae52c6fc17c274";
const sottoPackage =
  "4d614496ec9b30b22545fd350ecb9ec999164cfb0b5953f46dbbf937f8918f57";
const splicePackage =
  "73e9ffdb6b0bc19a5f67372b118103926da11547ab9109eccae47e4e4cc35d6f";

const BASE_INPUT: ClosureInput = {
  version: "sotto-package-closure-v1",
  sourcePins: [
    {
      id: "sotto",
      repository: "https://github.com/Blockchain-Oracle/sotto",
      commit: "b".repeat(40),
    },
    {
      id: "splice",
      repository: "https://github.com/hyperledger-labs/splice",
      commit: "fd93f86ac42ce3a08985dcd0baae530b4f235f60",
    },
  ],
  artifacts: [
    {
      id: "sotto-control-0.2.0",
      name: "sotto-control",
      version: "0.2.0",
      sourcePinId: "sotto",
      darSha256: "a".repeat(64),
      mainPackageId: sottoPackage,
      manifestSha256:
        "65ee0af362f6ed37e523c5c8f7ca8e7ab07128a794acf28784fac064d0d8f855",
      packages: [
        { packageId: damlPrimA, name: "daml-prim", version: "0.0.0" },
        { packageId: sottoPackage, name: "sotto-control", version: "0.2.0" },
      ],
    },
    {
      id: "splice-amulet-0.1.21",
      name: "splice-amulet",
      version: "0.1.21",
      sourcePinId: "splice",
      darSha256:
        "c26e1a4064afc9329167f90ad6f7e6f7236bc395fe480d1f113adc4e0168124c",
      mainPackageId: splicePackage,
      manifestSha256:
        "cae0c15a9487b21ecc1d91eea405bf4b1887f16cb05e5bc24856430d9851abb5",
      packages: [
        { packageId: damlPrimA, name: "daml-prim", version: "0.0.0" },
        { packageId: damlPrimB, name: "daml-prim", version: "0.0.0" },
        { packageId: splicePackage, name: "splice-amulet", version: "0.1.21" },
      ],
    },
  ],
  selectablePackageNames: ["sotto-control", "splice-amulet"],
  graphPackages: [
    { packageId: damlPrimA, name: "daml-prim", version: "0.0.0" },
    { packageId: damlPrimB, name: "daml-prim", version: "0.0.0" },
    { packageId: sottoPackage, name: "sotto-control", version: "0.2.0" },
    { packageId: splicePackage, name: "splice-amulet", version: "0.1.21" },
  ],
};

export const validClosureInput = (): ClosureInput =>
  structuredClone(BASE_INPUT);
