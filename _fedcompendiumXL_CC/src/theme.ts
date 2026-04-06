import { extendTheme, ThemeConfig } from '@chakra-ui/react';

// Define color mode config
const config: ThemeConfig = {
  initialColorMode: 'light',
  useSystemColorMode: true,
};

// Define custom colors
const colors = {
  brand: {
    50: '#e6f6ff',
    100: '#b3e0ff',
    200: '#80caff',
    300: '#4db3ff',
    400: '#1a9dff',
    500: '#0080ff',
    600: '#0066cc',
    700: '#004d99',
    800: '#003366',
    900: '#001933',
  },
  accent: {
    50: '#e6fff2',
    100: '#b3ffd9',
    200: '#80ffbf',
    300: '#4dffa6',
    400: '#1aff8c',
    500: '#00e673',
    600: '#00b359',
    700: '#008040',
    800: '#004d26',
    900: '#001a0d',
  },
};

// Define custom font stacks
const fonts = {
  heading: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
  body: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
  mono: 'SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
};

// Define custom component styles
const components = {
  Button: {
    baseStyle: {
      fontWeight: 'medium',
      borderRadius: 'md',
    },
    variants: {
      solid: (props: { colorScheme: string }) => ({
        bg: props.colorScheme === 'brand' ? 'brand.500' : `${props.colorScheme}.500`,
        color: 'white',
        _hover: {
          bg: props.colorScheme === 'brand' ? 'brand.600' : `${props.colorScheme}.600`,
        },
      }),
    },
  },
  Card: {
    baseStyle: {
      container: {
        borderRadius: 'lg',
        overflow: 'hidden',
      },
    },
  },
};

// Define custom global styles
const styles = {
  global: (props: { colorMode: 'light' | 'dark' }) => ({
    body: {
      bg: props.colorMode === 'light' ? 'gray.50' : 'gray.900',
      color: props.colorMode === 'light' ? 'gray.800' : 'white',
    },
  }),
};

// Extend the theme
const theme = extendTheme({
  config,
  colors,
  fonts,
  components,
  styles,
});

export default theme;