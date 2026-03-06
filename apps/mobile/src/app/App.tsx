import React, { useMemo, useState } from 'react';
import { StatusBar, View } from 'react-native';

import { PageTabs } from './components/page-tabs';
import { HomePage } from './pages/home-page';
import { MapPage } from './pages/map-page';
import { SettingsPage } from './pages/settings-page';

type AppPage = 'home' | 'map' | 'settings';

export const App = () => {
  const [activePage, setActivePage] = useState<AppPage>('home');

  const pageContent = useMemo(() => {
    if (activePage === 'map') {
      return <MapPage />;
    }
    if (activePage === 'settings') {
      return <SettingsPage />;
    }
    return <HomePage />;
  }, [activePage]);

  return (
    <View style={{ flex: 1, backgroundColor: '#f4f7fb' }}>
      <StatusBar barStyle="dark-content" />
      <View style={{ flex: 1 }}>{pageContent}</View>
      <PageTabs activePage={activePage} onPageChange={setActivePage} />
    </View>
  );
};

export default App;
