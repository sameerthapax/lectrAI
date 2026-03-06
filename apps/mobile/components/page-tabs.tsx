import React from 'react';
import { Pressable, Text, View } from 'react-native';

type AppPage = 'home' | 'map' | 'settings';

type PageTabsProps = {
  activePage: AppPage;
  onPageChange: (page: AppPage) => void;
};

const tabs: Array<{ key: AppPage; label: string }> = [
  { key: 'home', label: 'Home' },
  { key: 'map', label: 'Map' },
  { key: 'settings', label: 'Settings' },
];

export const PageTabs = ({ activePage, onPageChange }: PageTabsProps) => {
  return (
    <View
      style={{
        paddingTop: 10,
        paddingBottom: 10,
        paddingHorizontal: 16,
        backgroundColor: '#ffffff',
        borderTopWidth: 1,
        borderTopColor: '#e6ebf2',
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          gap: 8,
        }}
      >
        {tabs.map((tab) => {
          const isActive = tab.key === activePage;

          return (
            <Pressable
              key={tab.key}
              onPress={() => onPageChange(tab.key)}
              style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 12,
                borderCurve: 'continuous',
                paddingVertical: 11,
                backgroundColor: isActive ? '#1b4d9c' : '#edf2fb',
              }}
            >
              <Text
                selectable
                style={{
                  color: isActive ? '#ffffff' : '#1d2733',
                  fontSize: 15,
                  fontWeight: isActive ? '700' : '600',
                }}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};
