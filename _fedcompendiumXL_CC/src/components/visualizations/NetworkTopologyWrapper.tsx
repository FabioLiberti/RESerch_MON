import React, { useRef, useEffect } from 'react';
import { Box } from '@chakra-ui/react';
import { NetworkTopology } from './NetworkTopology';

interface NetworkTopologyWrapperProps {
  numClients: number;
  distribution: 'iid' | 'non_iid_label' | 'non_iid_quantity';
  isActive: boolean;
}

/**
 * Wrapper per il componente NetworkTopology che assicura una visualizzazione corretta
 * gestendo correttamente dimensioni, posizionamento e overflow
 */
export const NetworkTopologyWrapper: React.FC<NetworkTopologyWrapperProps> = ({
  numClients,
  distribution,
  isActive
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Gestione del ridimensionamento responsivo
  useEffect(() => {
    if (!containerRef.current) return;
    
    const resizeObserver = new ResizeObserver(entries => {
      // Logica per adattarsi al nuovo dimensionamento se necessario
    });
    
    resizeObserver.observe(containerRef.current);
    
    return () => {
      if (containerRef.current) {
        resizeObserver.unobserve(containerRef.current);
      }
    };
  }, []);
  
  return (
    <Box
      ref={containerRef}
      position="relative"
      height="320px"
      width="100%"
      overflow="visible"
      sx={{
        // Stili custom per assicurare che il contenuto SVG sia completamente visibile
        '& svg': {
          overflow: 'visible !important',
          display: 'block'
        },
        // Assicura che il contenuto del NetworkTopology non venga tagliato
        '& > div': {
          overflow: 'visible !important'
        }
      }}
    >
      <Box 
        position="absolute"
        top="0"
        left="0"
        width="100%"
        height="100%"
        display="flex"
        justifyContent="center"
        alignItems="center"
      >
        <NetworkTopology
          numClients={numClients}
          distribution={distribution}
          isActive={isActive}
          // Dimensioni leggermente ridotte per assicurarsi che entri nel container
          width={550}
          height={280}
        />
      </Box>
    </Box>
  );
};

// Export default per permettere sia l'importazione nominale che quella default
export default NetworkTopologyWrapper;