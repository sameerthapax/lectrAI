import * as React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import App from './App';

test('renders correctly', () => {
  const { getByTestId, getByText } = render(<App />);

  expect(getByTestId('home-title')).toHaveTextContent('Home');

  fireEvent.press(getByText('Map'));
  expect(getByText(/Map page placeholder/)).toBeTruthy();
});
