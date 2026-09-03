import { OfficialSnapshotStoreLocatorAdapter, UnsupportedStoreLocatorAdapter, type StoreLocatorIdentityAdapter } from "./store-locator.js";

/**
 * Bounded records observed from merchant-controlled public pages in the prior
 * audit. They are response snapshots, not branch URL enumeration. Refreshing
 * them requires re-observing the same merchant-level public experience.
 */
export const OBSERVED_LOCATOR_ADAPTERS: readonly StoreLocatorIdentityAdapter[] = [
  new OfficialSnapshotStoreLocatorAdapter({
    merchantKey: "chowking-ph", merchantName: "Chowking", officialDomains: ["chowking.ph"], sourceType: "official_store_locator", sourceReference: "https://www.chowking.ph/location", access: "PUBLIC_NORMAL_EXPERIENCE",
  }, {
    stores: [
      ["SM MEGAMALL", "Unit 208 Ground Floor, SM Megamall, Building A, Ortigas Center", "8635-4668 / 9209114913"], ["ANNAPOLIS ALBANY", "Lot1 Block 9 Albany Street, Corner Annapolis Street", "86937017 / 0998-9524339"], ["EDSA CENTRAL", "Shaw Boulevard Corner Sto Cristo Street, Mandaluyong City", "8-252-3963 / 09209114842 / 09453074701"], ["SHAW ACACIA", "Acacia Lane, Shaw Boulevard, Baranggay Addition Hills, Mandaluyong City", "8-355-4378 / 9453196362"], ["SM LIGHT MALL", "Level 1 SM Light Mall, EDSA Corner Madison Street, Barangka", "7-719-9432"], ["SHAW BLVD.", "24 AA Tangco Building, Shaw Boulevard Corner Kalentong Street", "88760928 / 9286153596"], ["BONI AVE.", "599 Boni Avenue Corner Sto. Rosario Street", "84708156 / 9297169330"], ["ROBINSONS GALLERIA", "Level 1 Robinsons Galleria, EDSA Corner Ortigas Avenue", "82779146"], ["STARMALL", "Ground Floor Starmall Building Corner Shaw Boulevard Mandaluyong City", "8-727-8929 / 9202006886"], ["BONNY SERRANO", "Ground Floor & 2F JG Ocampo Building Lot 7B, Blk.4, Col. Bonny Serrano Avenue", "8-470-5042 / 0928-5022362"], ["REMAR", "Level 1-2 Roxanne Building, Aurora Boulevard", "09213395908 / 0920-5406249"], ["EDSA CUBAO", "Level 1 Good Leaf Building, EDSA Street", "09196226464 / 09060653825"], ["SAMPAGUITA (ARANETA CUBAO)", "Sampaguita Theater Building, General Araneta Avenue, Corner General", "8-241-0104 / 0998-8474601"], ["ALI MALL", "Level 1 Ali Mall Building, P. Tuazon Boulevard Corner General", "8-332-5919 / 0998-5686867"], ["HI-TOP", "HiTop Supermarket Building, Aurora Boulevard Corner Castillo Street", "8-421-06-26 / 0920-9114922"],
    ].map(([name, address, phone]) => ({ officialName: `Chowking ${name!}`, address: address!, phone: phone!, active: true })),
    warnings: ["Bounded official locator response observed 15 stores. The public response did not expose stable external IDs or coordinates."],
    unsupportedFields: ["external_store_id", "coordinates", "source_updated_at"],
  }),
  new OfficialSnapshotStoreLocatorAdapter({
    merchantKey: "yardstick-coffee", merchantName: "Yardstick Coffee", officialDomains: ["yardstickcoffee.com"], sourceType: "official_structured_listing", sourceReference: "https://store.yardstickcoffee.com/pages/cafe", access: "PUBLIC_NORMAL_EXPERIENCE",
  }, {
    stores: [
      ["Legazpi Village", "Universal LMS Building, 106 Esteban Street, Makati, Metro Manila"], ["MOA Square", "MOA Square, 2nd Floor, Pasay, Metro Manila"], ["Opus Mall", "Level 2, Maisonette, Opus Mall, Bridgetowne Blvd., Cor. C5 Road, Ugong Norte, Quezon City"], ["Otaku Room BGC", "Atmos Flagship Store BGC, 3rd Avenue, One Bonifacio High Street, Bonifacio Global City, Taguig"], ["Podium", "G/F, The Podium, Ortigas Center, Mandaluyong, Metro Manila"], ["Rockwell", "Stall 227 Maisonette R2 Level Rockwell Powerplant Mall, Makati City 1224"], ["Salcedo Village", "119 L.P. Leviste Street, Makati, 1227 Metro Manila"], ["SM Aura", "4th Floor, SM Cinema, 26th Street Corner McKinley Parkway Bonifacio Global City, Taguig City"], ["The Corner House", "P. Guevarra, cor Recto, San Juan, 1500 Metro Manila"],
    ].map(([name, address]) => ({ officialName: `Yardstick ${name!}`, address: address!, active: true })),
    warnings: ["Official cafe listing is identity evidence only. Its retail catalog is not cafe pricing evidence."],
    unsupportedFields: ["external_store_id", "coordinates", "phone", "source_updated_at"],
  }),
  new UnsupportedStoreLocatorAdapter({
    merchantKey: "kfc-ph", merchantName: "KFC", officialDomains: ["kfc.com.ph"], sourceType: "official_store_locator", sourceReference: "https://www.kfc.com.ph/en/menu", access: "PUBLIC_NORMAL_EXPERIENCE",
  }, "UNSUPPORTED: the public KFC locator was dynamic and could not be reproducibly captured without probing non-public endpoints.", ["stores", "external_store_id", "address", "phone", "coordinates"]),
  new UnsupportedStoreLocatorAdapter({
    merchantKey: "jollibee-ph", merchantName: "Jollibee", officialDomains: ["jollibee.com", "jollibee.com.ph"], sourceType: "official_store_locator", sourceReference: "https://order.jollibee.com/en/ph", access: "PUBLIC_NORMAL_EXPERIENCE",
  }, "UNSUPPORTED: the public Jollibee flow required interactive location selection; no bulk public store response was safely observed.", ["stores", "external_store_id", "address", "phone", "coordinates"]),
];
