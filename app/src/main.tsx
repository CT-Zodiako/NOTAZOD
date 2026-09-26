import React from "react";
import ReactDOM from "react-dom/client";
import { MantineProvider, createTheme } from "@mantine/core";
import "@mantine/core/styles.css";
import "./tokens.css";
import "./App.css";
import App from "./App";

const theme = createTheme({
  fontFamily: "Nunito, sans-serif",
  primaryColor: "brand",
  colors: {
    brand: ["#F6EAF0", "#EAC8D5", "#DDA7B9", "#CC849D", "#B96883", "#9C4D69", "#813B56", "#682F48", "#50263A", "#381D2B"],
  },
  defaultRadius: "sm",
  primaryShade: { light: 6, dark: 4 },
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <App />
    </MantineProvider>
  </React.StrictMode>,
);
