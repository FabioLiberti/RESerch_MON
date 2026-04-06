import React from 'react';
import {
  Box,
  Container,
  useColorModeValue,
} from '@chakra-ui/react';
import ResearchPapersGrid from '../components/research/ResearchPapersGrid';

const PapersPage: React.FC = () => {
  const bgColor = useColorModeValue('gray.50', 'gray.900');
  
  const handlePaperSelect = (paperId: string) => {
    console.log(`Selected paper: ${paperId}`);
    // Implement paper detail view navigation or modal
    alert(`Paper detail view for ${paperId} would open here`);
  };
  
  return (
    <Box minH="100vh" bg={bgColor} py={8}>
      <Container maxW="container.xl">
        <ResearchPapersGrid onPaperSelect={handlePaperSelect} />
      </Container>
    </Box>
  );
};

export default PapersPage;