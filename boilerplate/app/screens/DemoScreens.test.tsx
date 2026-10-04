import { ComponentProps, ReactNode, useEffect } from "react"
import { NavigationContainer } from "@react-navigation/native"
import { createNativeStackNavigator } from "@react-navigation/native-stack"
import { fireEvent, render, waitFor } from "@testing-library/react-native"
import { SafeAreaProvider } from "react-native-safe-area-context"

import { Card } from "@/components/Card"
import { AuthProvider, useAuth } from "@/context/AuthContext"
import { EpisodeProvider } from "@/context/EpisodeContext"
import { api } from "@/services/api"
import type { EpisodeItem } from "@/services/api/types"
import { ThemeProvider } from "@/theme/context"

import { DemoPodcastListScreen } from "./DemoPodcastListScreen"
import { LoginScreen } from "./LoginScreen"

// Supply the native animation boundary; screens, contexts and controls stay real.
// The general setup replaces Image with a static helper object; these screens render images.
jest.mock("react-native", () => jest.requireActual("react-native"))
jest.mock("react-native-keyboard-controller", () =>
  require("react-native-keyboard-controller/jest"),
)
jest.mock("react-native-reanimated", () => {
  const { useState } = require("react")
  const { View } = require("react-native")
  return {
    __esModule: true,
    default: { View },
    Extrapolation: { EXTEND: "extend", CLAMP: "clamp" },
    interpolate: (value: number, _input: number[], output: number[]) =>
      output[0] + value * (output[1] - output[0]),
    useAnimatedStyle: (style: () => unknown) => style(),
    useSharedValue: (initial: number) =>
      useState(() => ({
        value: initial,
        get() {
          return this.value
        },
        set(value: number) {
          this.value = value
        },
      }))[0],
    withSpring: jest.fn((target: number) => target),
  }
})

const episode: EpisodeItem = {
  title: "RNR 123 - Demo episode",
  guid: "demo-episode-123",
  pubDate: "2026-10-04T00:00:00Z",
  link: "https://example.org/episode",
  author: "Demo author",
  thumbnail: "",
  description: "Demo description",
  content: "Demo content",
  categories: ["Technology"],
  enclosure: {
    link: "https://example.org/episode.mp3",
    type: "audio/mpeg",
    length: 123,
    duration: 60,
    rating: { scheme: "urn:simple", value: "clean" },
  },
}

const Stack = createNativeStackNavigator()

function Providers({ children }: { children: ReactNode }) {
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, right: 0, bottom: 0, left: 0 },
      }}
    >
      <ThemeProvider>
        <NavigationContainer>
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Demo">{() => children}</Stack.Screen>
          </Stack.Navigator>
        </NavigationContainer>
      </ThemeProvider>
    </SafeAreaProvider>
  )
}

function renderPodcast() {
  return render(
    <EpisodeProvider>
      <DemoPodcastListScreen {...({} as ComponentProps<typeof DemoPodcastListScreen>)} />
    </EpisodeProvider>,
    { wrapper: Providers },
  )
}

afterEach(() => jest.restoreAllMocks())

describe("retained podcast demo", () => {
  beforeEach(() => jest.spyOn(api, "getEpisodes").mockResolvedValue([episode]))

  it("keeps the same episode thumbnail after remounting", async () => {
    // A render-time random thumbnail can change when virtualization remounts a card.
    const random = jest.spyOn(Math, "random").mockReturnValue(0)
    const first = renderPodcast()
    await waitFor(() => expect(first.UNSAFE_getByType(Card)).toBeDefined())
    const image = first.UNSAFE_getByType(Card).props.RightComponent.props.source
    first.unmount()
    random.mockReturnValue(0.99)
    const second = renderPodcast()
    await waitFor(() => expect(second.UNSAFE_getByType(Card)).toBeDefined())
    expect(second.UNSAFE_getByType(Card).props.RightComponent.props.source).toBe(image)
  })

  it("toggles favorites with matching spring targets on button press and card long press", async () => {
    const spring = jest.spyOn(require("react-native-reanimated"), "withSpring")
    const view = renderPodcast()
    const favorite = await view.findByLabelText("demoPodcastListScreen:accessibility.favoriteIcon")
    fireEvent.press(favorite)
    expect(view.getByLabelText("demoPodcastListScreen:accessibility.unfavoriteIcon")).toBeDefined()
    expect(spring).toHaveBeenLastCalledWith(1)
    fireEvent(view.UNSAFE_getByType(Card), "longPress")
    expect(view.getByLabelText("demoPodcastListScreen:accessibility.favoriteIcon")).toBeDefined()
    expect(spring).toHaveBeenLastCalledWith(0)
  })
})

describe("retained example login", () => {
  it("prefills editable credentials and clears them after the local example login", () => {
    let auth: ReturnType<typeof useAuth>
    function ObserveAuth({ showLogin }: { showLogin: boolean }) {
      const state = useAuth()
      useEffect(() => {
        auth = state
      }, [state])
      return showLogin ? <LoginScreen {...({} as ComponentProps<typeof LoginScreen>)} /> : null
    }
    const view = render(
      <AuthProvider>
        <ObserveAuth showLogin={false} />
      </AuthProvider>,
      { wrapper: Providers },
    )
    // Establish the real MMKV subscriptions before entering the login route.
    view.rerender(
      <AuthProvider>
        <ObserveAuth showLogin />
      </AuthProvider>,
    )
    expect(view.getByDisplayValue("ignite@infinite.red")).toBeDefined()
    const password = view.getByDisplayValue("ign1teIsAwes0m3")
    fireEvent.changeText(password, "edited-password")
    expect(view.getByDisplayValue("edited-password")).toBeDefined()
    fireEvent.press(view.getByTestId("login-button"))
    expect(auth!.isAuthenticated).toBe(true)
    expect(auth!.authEmail).toBe("")
    expect(view.queryByDisplayValue("edited-password")).toBeNull()
  })
})

// @demo remove-file
