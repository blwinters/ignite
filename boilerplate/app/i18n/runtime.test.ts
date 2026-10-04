import { initI18n } from "."

jest.unmock("i18next")
jest.unmock(".")

jest.mock("expo-localization", () => ({
  ...jest.requireActual("expo-localization"),
  getLocales: () => [
    {
      languageTag: "es-ES",
      languageCode: "es",
      languageScriptCode: "Latn",
      regionCode: "ES",
      languageRegionCode: "ES",
      currencyCode: "EUR",
      currencySymbol: "€",
      languageCurrencyCode: "EUR",
      languageCurrencySymbol: "€",
      decimalSeparator: ",",
      digitGroupingSeparator: ".",
      textDirection: "ltr",
      measurementSystem: "metric",
      temperatureUnit: "celsius",
    },
  ],
}))

it("initializes the real React i18n integration and switches between regional locales", async () => {
  const i18n = await initI18n()
  expect(i18n.t("common:back")).toBe("Volver")
  await i18n.changeLanguage("en-US")
  expect(i18n.t("common:back")).toBe("Back")
})
