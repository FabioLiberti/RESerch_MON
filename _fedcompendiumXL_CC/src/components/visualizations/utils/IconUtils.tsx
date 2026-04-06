import React from 'react';
import { IconType } from 'react-icons';
import { Box, BoxProps } from '@chakra-ui/react';

// TypeScript richiede un cast esplicito per risolvere il problema con IconType
type AnyComponent = React.ComponentType<any>;

// Componente wrapper per icone che risolve i problemi di tipo
export const IconBox: React.FC<BoxProps & { 
  icon: IconType;
  size?: number;
  color?: string;
}> = ({ icon, size = 16, color, ...boxProps }) => {
  // Cast esplicito per risolvere il problema di tipo
  const IconComponent = icon as AnyComponent;
  
  return (
    <Box {...boxProps}>
      <IconComponent size={size} color={color} />
    </Box>
  );
};