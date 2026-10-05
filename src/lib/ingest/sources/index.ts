import type { RawPosting, SeedCompany } from "../types";
import { fetchAshby } from "./ashby";
import { fetchGreenhouse } from "./greenhouse";
import { fetchLever } from "./lever";

export { fetchSimplify, parseSimplify, SIMPLIFY_LISTS } from "./simplify";
export { parseGreenhouse } from "./greenhouse";
export { parseLever } from "./lever";
export { parseAshby } from "./ashby";

export function fetchCompanyBoard(company: SeedCompany): Promise<RawPosting[]> {
  switch (company.ats) {
    case "greenhouse":
      return fetchGreenhouse(company);
    case "lever":
      return fetchLever(company);
    case "ashby":
      return fetchAshby(company);
  }
}
